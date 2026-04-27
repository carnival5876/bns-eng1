(async()=>{
  const list = await fetch('http://localhost:4000/api/products').then(r=>r.json());
  if(!list.length){
    console.log('NO_PRODUCTS');
    return;
  }
  const p = list[0];
  p.siteName = '수정테스트현장';
  if(p.specs && p.specs.length){
    p.specs[0].details = '수정값';
  }
  const res = await fetch('http://localhost:4000/api/products/' + p.id, {
    method: 'PUT',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({siteName:p.siteName, productName:p.name, type:p.type, specs:p.specs})
  });
  console.log('PUT_STATUS', res.status);
  console.log(await res.text());
})();
