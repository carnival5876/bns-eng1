import React, { useMemo, useState } from 'react';
import { REGION_DATA, SIDO_COORDINATES } from '../constants/koreaRegions';
import { feature as topojsonFeature } from 'topojson-client';
import polylabel from '@mapbox/polylabel';

const toLatLng = (kakao, lat, lng) => new kakao.maps.LatLng(lat, lng);
const radialCoords = (center, index, total, radiusLat, radiusLng) => {
    const angle = (Math.PI * 2 * index) / Math.max(total, 1);
    return {
        lat: center.lat + (Math.sin(angle) * radiusLat),
        lng: center.lng + (Math.cos(angle) * radiusLng),
    };
};

const normalizeRegionName = (name) => String(name || '')
    .replace(/\s+/g, '')
    .replace(/[·\.\-]/g, '')
    .replace(/제/g, '')
    .trim();

const normalizeSidoName = (name) => {
    let normalized = normalizeRegionName(name);
    normalized = normalized.replace(/특별자치|특별|광역|자치/g, '');
    normalized = normalized.replace(/^전북/, '전라북');
    return normalized;
};

const KoreaRegionMap = ({ models = [] }) => {
    const [selectedSido, setSelectedSido] = useState('');
    const [selectedGugun, setSelectedGugun] = useState('');
    const [selectedSidoCoord, setSelectedSidoCoord] = useState(null);
    const [selectedGugunCoord, setSelectedGugunCoord] = useState(null);
    const [kakaoReady, setKakaoReady] = useState(false);
    const [mapError, setMapError] = useState('');
    const [regionTree, setRegionTree] = useState(() => REGION_DATA);
    const [dongTopoData, setDongTopoData] = useState(null);
    const [sidoTopoData, setSidoTopoData] = useState(null);
    const [gugunTopoData, setGugunTopoData] = useState(null);
    const mapRootId = 'korea-region-kakao-map';
    const jsKey = process.env.REACT_APP_KAKAO_MAP_JS_KEY || '98d1437e9734f3421f11d84559c4d405';
    const mapRef = React.useRef(null);
    const overlaysRef = React.useRef([]);
    const geocoderRef = React.useRef(null);
    const coordCacheRef = React.useRef(new Map());
    const sdkReadyPromiseRef = React.useRef(null);
    const focusLockRef = React.useRef(null);
    const dongCodeMapRef = React.useRef(new Map());
    const regionDataUrl = 'https://raw.githubusercontent.com/vuski/admdongkor/master/%ED%86%B5%EA%B3%84%EC%B2%ADMDIS%EC%9D%B8%EA%B5%AC%EC%9A%A9_%ED%96%89%EC%A0%95%EA%B2%BD%EA%B3%84%EC%A4%91%EC%8B%AC%EC%A0%90/coordinate_UTMK_%EC%9D%B4%EB%A6%84%ED%8F%AC%ED%95%A8.tsv';
    const dongTopoDataUrl = 'https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2018/json/skorea-submunicipalities-2018-topo-simple.json';
    const sidoTopoDataUrl = 'https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2018/json/skorea-provinces-2018-topo-simple.json';
    const gugunTopoDataUrl = 'https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2018/json/skorea-municipalities-2018-topo-simple.json';

    const normalized = useMemo(() => {
        const inferFromAddress = (address) => {
            const raw = String(address || '').trim();
            if (!raw) {
                return { sido: '', gugun: '', dong: '' };
            }
            const compact = raw.replace(/\s+/g, '');
            const sido = Object.keys(regionTree).find((name) => compact.includes(String(name).replace(/\s+/g, ''))) || '';
            if (!sido) {
                return { sido: '', gugun: '', dong: '' };
            }
            const gugunList = Object.keys(regionTree[sido] || {});
            const gugun = gugunList.find((name) => compact.includes(String(name).replace(/\s+/g, ''))) || '';
            if (!gugun) {
                return { sido, gugun: '', dong: '' };
            }
            const dongList = regionTree[sido]?.[gugun] || [];
            const dong = dongList.find((name) => compact.includes(String(name).replace(/\s+/g, ''))) || '';
            return { sido, gugun, dong };
        };

        return models.map((m) => {
            const inferred = inferFromAddress(m.detailAddress);
            return {
                sido: String(m.sido || inferred.sido || '').trim(),
                gugun: String(m.gugun || inferred.gugun || '').trim(),
                dong: String(m.dong || inferred.dong || '').trim(),
            };
        });
    }, [models, regionTree]);

    React.useEffect(() => {
        let cancelled = false;
        const parseTree = (tsvText) => {
            const lines = String(tsvText || '').split(/\r?\n/).slice(1);
            const tree = {};
            const codeMap = new Map();
            const normalizeName = (name) => String(name || '')
                .replace(/\s+/g, '')
                .replace(/[·\.\-]/g, '')
                .replace(/제/g, '')
                .trim();
            lines.forEach((line) => {
                const trimmed = line.trim();
                if (!trimmed) {
                    return;
                }
                const parts = trimmed.split(/\s+/);
                if (parts.length < 5) {
                    return;
                }
                const admCode = String(parts[1] || '');
                const nameParts = parts.slice(2, -2);
                if (nameParts.length === 0) {
                    return;
                }
                const sido = nameParts[0];
                if (!tree[sido]) {
                    tree[sido] = {};
                }
                if (nameParts.length < 2) {
                    return;
                }
                const maybeGugun = nameParts[1];
                const isGugunToken = /[시군구]$/.test(maybeGugun);
                const gugun = isGugunToken ? maybeGugun : (sido === '세종특별자치시' ? '세종시' : '');
                if (!gugun) {
                    return;
                }
                if (!tree[sido][gugun]) {
                    tree[sido][gugun] = new Set();
                }
                const dong = isGugunToken ? nameParts.slice(2).join(' ') : nameParts.slice(1).join(' ');
                if (dong) {
                    tree[sido][gugun].add(dong);
                    if (admCode.length >= 7) {
                        const code7 = admCode.slice(0, 7);
                        const key = `${sido}::${gugun}::${normalizeName(dong)}`;
                        codeMap.set(key, code7);
                    }
                }
            });
            const normalizedTree = {};
            Object.entries(tree).forEach(([sido, gugunMap]) => {
                normalizedTree[sido] = {};
                Object.entries(gugunMap).forEach(([gugun, dongSet]) => {
                    const dongs = Array.from(dongSet).sort((a, b) => a.localeCompare(b, 'ko'));
                    normalizedTree[sido][gugun] = dongs.length > 0 ? dongs : ['전체'];
                });
            });
            dongCodeMapRef.current = codeMap;
            return normalizedTree;
        };

        const loadRegionTree = async () => {
            try {
                const res = await fetch(regionDataUrl);
                if (!res.ok) {
                    throw new Error('행정구역 실데이터를 불러오지 못했습니다.');
                }
                const text = await res.text();
                const parsed = parseTree(text);
                if (!cancelled && Object.keys(parsed).length > 0) {
                    setRegionTree(parsed);
                }
            } catch (error) {
                if (!cancelled) {
                    setRegionTree(REGION_DATA);
                }
            }
        };
        loadRegionTree();
        return () => {
            cancelled = true;
        };
    }, []);

    React.useEffect(() => {
        let cancelled = false;
        const loadTopoData = async () => {
            try {
                const [dongRes, sidoRes, gugunRes] = await Promise.all([
                    fetch(dongTopoDataUrl),
                    fetch(sidoTopoDataUrl),
                    fetch(gugunTopoDataUrl),
                ]);
                if (!dongRes.ok || !sidoRes.ok || !gugunRes.ok) {
                    throw new Error('행정 경계 TopoJSON을 불러오지 못했습니다.');
                }
                const [dongData, sidoData, gugunData] = await Promise.all([
                    dongRes.json(),
                    sidoRes.json(),
                    gugunRes.json(),
                ]);
                if (!cancelled) {
                    setDongTopoData(dongData);
                    setSidoTopoData(sidoData);
                    setGugunTopoData(gugunData);
                }
            } catch (error) {
                if (!cancelled) {
                    setDongTopoData(null);
                    setSidoTopoData(null);
                    setGugunTopoData(null);
                }
            }
        };
        loadTopoData();
        return () => {
            cancelled = true;
        };
    }, []);

    const sidoCounts = useMemo(() => {
        const map = new Map();
        normalized.forEach((item) => {
            const key = item.sido || '미지정';
            map.set(key, (map.get(key) || 0) + 1);
        });
        const base = Object.keys(regionTree).map((name) => ({ name, count: map.get(name) || 0 }));
        const extras = Array.from(map.entries())
            .filter(([name]) => !Object.prototype.hasOwnProperty.call(regionTree, name))
            .map(([name, count]) => ({ name, count }));
        return [...base, ...extras]
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko'));
    }, [normalized, regionTree]);

    const gugunCounts = useMemo(() => {
        if (!selectedSido) {
            return [];
        }
        const map = new Map();
        normalized
            .filter((item) => (item.sido || '미지정') === selectedSido)
            .forEach((item) => {
                const key = item.gugun || '미지정';
                map.set(key, (map.get(key) || 0) + 1);
            });
        const base = Object.keys(regionTree[selectedSido] || {}).map((name) => ({ name, count: map.get(name) || 0 }));
        const extras = Array.from(map.entries())
            .filter(([name]) => !(regionTree[selectedSido] || {})[name])
            .map(([name, count]) => ({ name, count }));
        return [...base, ...extras]
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko'));
    }, [normalized, selectedSido, regionTree]);

    const dongCounts = useMemo(() => {
        if (!selectedSido || !selectedGugun) {
            return [];
        }
        const map = new Map();
        normalized
            .filter((item) => (item.sido || '미지정') === selectedSido && (item.gugun || '미지정') === selectedGugun)
            .forEach((item) => {
                const key = item.dong || '미지정';
                map.set(key, (map.get(key) || 0) + 1);
            });
        const base = (regionTree[selectedSido]?.[selectedGugun] || []).map((name) => ({ name, count: map.get(name) || 0 }));
        const baseSet = new Set(base.map((item) => item.name));
        const extras = Array.from(map.entries())
            .filter(([name]) => !baseSet.has(name))
            .map(([name, count]) => ({ name, count }));
        return [...base, ...extras]
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko'));
    }, [normalized, selectedSido, selectedGugun, regionTree]);

    const stage = selectedSido ? (selectedGugun ? 'dong' : 'gugun') : 'sido';
    const stageItems = stage === 'sido' ? sidoCounts : stage === 'gugun' ? gugunCounts : dongCounts;
    const stageTitle = stage === 'sido'
        ? '시/도'
        : stage === 'gugun'
            ? `${selectedSido} / 구·군`
            : `${selectedSido} ${selectedGugun} / 동·읍·면`;
    const centerCoord = selectedGugunCoord
        || selectedSidoCoord
        || (selectedSido && SIDO_COORDINATES[selectedSido])
        || { lat: 36.35, lng: 127.8 };

    const sidoBaseCoord = selectedSidoCoord
        || (selectedSido && SIDO_COORDINATES[selectedSido])
        || { lat: 36.35, lng: 127.8 };
    React.useEffect(() => {
        try {
            const raw = localStorage.getItem('korea-region-coord-cache');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') {
                    coordCacheRef.current = new Map(Object.entries(parsed));
                }
            }
        } catch (error) {
            // ignore cache parse failure
        }
    }, []);

    React.useEffect(() => {
        if (!jsKey) {
            setMapError('카카오 지도 API 키가 없습니다. REACT_APP_KAKAO_MAP_JS_KEY를 설정해주세요.');
            return;
        }
        const ensureSdkReady = () => {
            if (sdkReadyPromiseRef.current) {
                return sdkReadyPromiseRef.current;
            }
            sdkReadyPromiseRef.current = new Promise((resolve, reject) => {
                const finalize = () => {
                    if (!window.kakao?.maps?.load) {
                        reject(new Error('카카오 지도 SDK 초기화에 실패했습니다.'));
                        return;
                    }
                    window.kakao.maps.load(() => resolve(true));
                };

                if (window.kakao?.maps?.load) {
                    finalize();
                    return;
                }

                const existing = document.getElementById('kakao-map-sdk');
                if (existing) {
                    existing.addEventListener('load', finalize, { once: true });
                    existing.addEventListener('error', () => reject(new Error('카카오 지도 스크립트를 불러오지 못했습니다.')), { once: true });
                    return;
                }

                const script = document.createElement('script');
                script.id = 'kakao-map-sdk';
                script.async = true;
                script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${jsKey}&autoload=false&libraries=services`;
                script.onload = finalize;
                script.onerror = () => reject(new Error('카카오 지도 스크립트를 불러오지 못했습니다.'));
                document.body.appendChild(script);
            });
            return sdkReadyPromiseRef.current;
        };

        let cancelled = false;
        ensureSdkReady()
            .then(() => {
                if (cancelled) {
                    return;
                }
                setMapError('');
                setKakaoReady(true);
            })
            .catch((error) => {
                if (cancelled) {
                    return;
                }
                setMapError(error?.message || '카카오 지도 스크립트를 불러오지 못했습니다.');
            });

        return () => {
            cancelled = true;
        };
    }, [jsKey]);

    React.useEffect(() => {
        if (!kakaoReady || mapRef.current || !window.kakao?.maps) {
            return;
        }
        const kakao = window.kakao;
        mapRef.current = new kakao.maps.Map(document.getElementById(mapRootId), {
            center: new kakao.maps.LatLng(36.35, 127.8),
            level: 13,
        });
        if (kakao.maps?.services) {
            geocoderRef.current = new kakao.maps.services.Geocoder();
        }
    }, [kakaoReady]);

    React.useEffect(() => {
        if (!mapRef.current || !window.kakao?.maps) {
            return;
        }
        const timer = window.setTimeout(() => {
            mapRef.current.relayout();
        }, 60);
        return () => window.clearTimeout(timer);
    }, [kakaoReady, stage, stageItems.length]);

    React.useEffect(() => {
        if (!mapRef.current || !window.kakao?.maps) {
            return;
        }
        const kakao = window.kakao;
        let targetCenter;
        let targetLevel;

        if (focusLockRef.current) {
            const locked = focusLockRef.current;
            targetCenter = new kakao.maps.LatLng(locked.lat, locked.lng);
            targetLevel = locked.level;
            focusLockRef.current = null;
        } else {
            targetCenter = new kakao.maps.LatLng(36.35, 127.8);
            targetLevel = 13;
            if (selectedSido) {
                const focus = selectedGugunCoord || selectedSidoCoord || SIDO_COORDINATES[selectedSido];
                if (focus) {
                    targetCenter = new kakao.maps.LatLng(focus.lat, focus.lng);
                }
                targetLevel = selectedGugun ? 8 : 11;
            }
        }
        mapRef.current.setCenter(targetCenter);
        mapRef.current.setLevel(targetLevel, { animate: true });
    }, [selectedSido, selectedGugun, selectedSidoCoord, selectedGugunCoord]);

    React.useEffect(() => {
        if (!mapRef.current || !window.kakao?.maps) {
            return;
        }
        const kakao = window.kakao;
        overlaysRef.current.forEach((overlay) => overlay.setMap(null));
        overlaysRef.current = [];
        let cancelled = false;

        const getQueryByStage = (name) => {
            if (stage === 'sido') {
                return name;
            }
            if (stage === 'gugun') {
                return `${selectedSido} ${name}`;
            }
            return `${selectedSido} ${selectedGugun} ${name}`;
        };

        const geocode = (query) => new Promise((resolve) => {
            const cached = coordCacheRef.current.get(query);
            if (cached) {
                resolve(cached);
                return;
            }
            if (!geocoderRef.current || !kakao.maps?.services) {
                resolve(null);
                return;
            }
            geocoderRef.current.addressSearch(query, (result, status) => {
                if (status === kakao.maps.services.Status.OK && Array.isArray(result) && result[0]) {
                    const coord = { lat: Number(result[0].y), lng: Number(result[0].x) };
                    coordCacheRef.current.set(query, coord);
                    try {
                        localStorage.setItem(
                            'korea-region-coord-cache',
                            JSON.stringify(Object.fromEntries(coordCacheRef.current))
                        );
                    } catch (error) {
                        // ignore storage quota errors
                    }
                    resolve(coord);
                    return;
                }
                resolve(null);
            });
        });

        const render = async () => {
            if (stage === 'dong' && dongTopoData) {
                const objectKey = Object.keys(dongTopoData.objects || {})[0];
                const targetObject = objectKey ? dongTopoData.objects[objectKey] : null;
                if (targetObject) {
                    let selectedSidoCode = '';
                    let selectedGugunCode = '';
                    if (sidoTopoData) {
                        const sidoObjectKey = Object.keys(sidoTopoData.objects || {})[0];
                        const sidoObject = sidoObjectKey ? sidoTopoData.objects[sidoObjectKey] : null;
                        if (sidoObject) {
                            const sidoFeatures = topojsonFeature(sidoTopoData, sidoObject).features || [];
                            const matchedSido = sidoFeatures.find((f) => (
                                normalizeSidoName(f?.properties?.name) === normalizeSidoName(selectedSido)
                            ));
                            selectedSidoCode = String(matchedSido?.properties?.code || '').slice(0, 2);
                        }
                    }
                    if (gugunTopoData && selectedSidoCode) {
                        const gugunObjectKey = Object.keys(gugunTopoData.objects || {})[0];
                        const gugunObject = gugunObjectKey ? gugunTopoData.objects[gugunObjectKey] : null;
                        if (gugunObject) {
                            const gugunFeatures = topojsonFeature(gugunTopoData, gugunObject).features || [];
                            const matchedGugun = gugunFeatures.find((f) => (
                                String(f?.properties?.code || '').startsWith(selectedSidoCode)
                                && normalizeRegionName(f?.properties?.name) === normalizeRegionName(selectedGugun)
                            ));
                            selectedGugunCode = String(matchedGugun?.properties?.code || '').slice(0, 5);
                        }
                    }
                    if (!selectedGugunCode) {
                        return;
                    }

                    const geoCollection = topojsonFeature(dongTopoData, targetObject);
                    const countMap = new Map(stageItems.map((item) => [item.name, item.count]));
                    const features = (geoCollection.features || []).filter((f) => {
                        const featureCode = String(f?.properties?.code || '');
                        return featureCode.startsWith(selectedGugunCode);
                    });

                    if (features.length === 0) {
                        return;
                    } else {
                        features.forEach((f) => {
                            const dongName = String(f?.properties?.name || '').trim();
                            if (!dongName) {
                                return;
                            }
                            const geometry = f.geometry || {};
                            const type = geometry.type;
                            const coordinates = geometry.coordinates;
                            if (!coordinates || (type !== 'Polygon' && type !== 'MultiPolygon')) {
                                return;
                            }

                            const bounds = new kakao.maps.LatLngBounds();
                            const drawPolygon = (ringCoords) => {
                                const path = ringCoords.map(([lng, lat]) => new kakao.maps.LatLng(lat, lng));
                                path.forEach((point) => bounds.extend(point));
                                const polygon = new kakao.maps.Polygon({
                                    map: mapRef.current,
                                    path,
                                    strokeWeight: 2,
                                    strokeColor: '#d97706',
                                    strokeOpacity: 0.82,
                                    strokeStyle: 'solid',
                                    fillOpacity: 0,
                                });
                                overlaysRef.current.push(polygon);
                            };

                            const polygonParts = type === 'Polygon' ? [coordinates] : coordinates;
                            polygonParts.forEach((polygon) => {
                                (polygon || []).forEach((ring) => drawPolygon(ring));
                            });

                            const polygonArea = (ring) => {
                                if (!Array.isArray(ring) || ring.length < 3) {
                                    return 0;
                                }
                                let area = 0;
                                for (let i = 0; i < ring.length; i += 1) {
                                    const [x1, y1] = ring[i];
                                    const [x2, y2] = ring[(i + 1) % ring.length];
                                    area += (x1 * y2) - (x2 * y1);
                                }
                                return Math.abs(area / 2);
                            };
                            let bestPolygon = null;
                            let bestArea = -1;
                            polygonParts.forEach((polygon) => {
                                const outer = polygon?.[0];
                                const area = polygonArea(outer);
                                if (area > bestArea) {
                                    bestArea = area;
                                    bestPolygon = polygon;
                                }
                            });
                            const labelPoint = bestPolygon ? polylabel(bestPolygon, 1.0) : null;
                            const center = labelPoint
                                ? new kakao.maps.LatLng(labelPoint[1], labelPoint[0])
                                : bounds.getCenter();
                            const count = countMap.get(dongName) || 0;
                            const label = document.createElement('div');
                            label.className = 'kakao-region-label dong-label';
                            if (!count) {
                                label.classList.add('zero-count');
                            }
                            const nameEl = document.createElement('span');
                            nameEl.className = 'bubble-name';
                            nameEl.innerText = dongName;
                            label.appendChild(nameEl);

                            const overlay = new kakao.maps.CustomOverlay({
                                position: center,
                                content: label,
                                yAnchor: 0.5,
                            });
                            overlay.setMap(mapRef.current);
                            overlaysRef.current.push(overlay);
                        });
                        return;
                    }
                }
            }

            const coords = await Promise.all(stageItems.map(async (item, index) => {
                const query = getQueryByStage(item.name);
                const found = await geocode(query);
                if (found) {
                    return { item, coord: found };
                }
                const fallback = stage === 'sido'
                    ? (SIDO_COORDINATES[item.name] || null)
                    : stage === 'gugun'
                        ? radialCoords(sidoBaseCoord, index, stageItems.length, 0.08, 0.1)
                        : radialCoords(centerCoord, index, stageItems.length, 0.045, 0.06);
                return { item, coord: fallback };
            }));

            if (cancelled) {
                return;
            }

            coords.forEach(({ item, coord }) => {
                if (!coord) {
                    return;
                }
                const isDongStage = stage === 'dong';
                const div = document.createElement('div');
                div.className = isDongStage ? 'kakao-region-label dong-label' : `kakao-region-bubble ${stage}`;
                if (!item.count) {
                    div.classList.add('zero-count');
                }
                const nameEl = document.createElement('span');
                nameEl.className = 'bubble-name';
                nameEl.innerText = item.name;
                div.appendChild(nameEl);
                if (!isDongStage) {
                    const countEl = document.createElement('span');
                    countEl.className = 'bubble-count';
                    countEl.innerText = String(item.count || 0);
                    div.appendChild(countEl);
                }
                div.onclick = () => {
                    if (mapRef.current && window.kakao?.maps && coord) {
                        const target = new window.kakao.maps.LatLng(coord.lat, coord.lng);
                        const level = stage === 'sido' ? 11 : stage === 'gugun' ? 8 : 6;
                        focusLockRef.current = { lat: coord.lat, lng: coord.lng, level };
                        mapRef.current.setCenter(target);
                        mapRef.current.setLevel(level, { animate: true });
                    }
                    if (stage === 'sido') {
                        setSelectedSido(item.name);
                        setSelectedGugun('');
                        setSelectedSidoCoord(coord);
                        setSelectedGugunCoord(null);
                    } else if (stage === 'gugun') {
                        setSelectedGugun(item.name);
                        setSelectedGugunCoord(coord);
                    }
                };

                if (isDongStage) {
                    const sizeLat = 0.0105;
                    const sizeLng = 0.0125;
                    const path = [
                        new kakao.maps.LatLng(coord.lat + sizeLat, coord.lng - sizeLng),
                        new kakao.maps.LatLng(coord.lat + sizeLat, coord.lng + sizeLng),
                        new kakao.maps.LatLng(coord.lat - sizeLat, coord.lng + sizeLng),
                        new kakao.maps.LatLng(coord.lat - sizeLat, coord.lng - sizeLng),
                    ];
                    const polygon = new kakao.maps.Polygon({
                        map: mapRef.current,
                        path,
                        strokeWeight: 2,
                        strokeColor: item.count > 0 ? '#d97706' : '#9ca3af',
                        strokeOpacity: item.count > 0 ? 0.8 : 0.45,
                        strokeStyle: 'solid',
                        fillOpacity: 0,
                    });
                    overlaysRef.current.push(polygon);
                }

                const overlay = new kakao.maps.CustomOverlay({
                    position: toLatLng(kakao, coord.lat, coord.lng),
                    content: div,
                    yAnchor: isDongStage ? 0.5 : 1.1,
                });
                overlay.setMap(mapRef.current);
                overlaysRef.current.push(overlay);
            });
        };

        render();
        return () => {
            cancelled = true;
        };
    }, [stage, stageItems, centerCoord, sidoBaseCoord, dongTopoData, selectedSido, selectedGugun, regionTree]);

    return (
        <div className="korea-map-panel">
            <h3>대한민국 지도</h3>
            <p className="korea-map-help">시/도 → 구/군 → 동/읍/면을 클릭하면 해당 행정구역 리스트 개수를 확인할 수 있습니다.</p>
            <div className="korea-map-toolbar">
                {stage !== 'sido' && (
                    <button
                        type="button"
                        className="korea-map-back-button"
                        onClick={() => {
                            if (stage === 'dong') {
                                setSelectedGugun('');
                                setSelectedGugunCoord(null);
                                return;
                            }
                            setSelectedSido('');
                            setSelectedGugun('');
                            setSelectedSidoCoord(null);
                            setSelectedGugunCoord(null);
                        }}
                    >
                        이전 단계
                    </button>
                )}
                {(selectedSido || selectedGugun) && (
                    <button
                        type="button"
                        className="korea-map-back-button"
                        onClick={() => {
                            setSelectedSido('');
                            setSelectedGugun('');
                            setSelectedSidoCoord(null);
                            setSelectedGugunCoord(null);
                        }}
                    >
                        전체 보기
                    </button>
                )}
            </div>
            <div className={`korea-map-level-wrap stage-${stage}`}>
                <div className="korea-map-level single">
                    <h4>{stageTitle}</h4>
                </div>
            </div>
            <div className="kakao-map-wrap">
                {mapError ? (
                    <div className="kakao-map-error">{mapError}</div>
                ) : (
                    <div id={mapRootId} className="kakao-map-canvas" />
                )}
            </div>
        </div>
    );
};

export default KoreaRegionMap;
