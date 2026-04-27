# Boiler Specification Management

This project is a web application for managing boiler specifications. It allows users to add new specifications, view them in a list, and see detailed information in a dropdown format.

## Features

- Add new boiler specifications through a popup form.
- View a list of specifications sorted by the most recent addition.
- Click on a specification to toggle the display of detailed information.
- Only one specification's details can be expanded at a time.

## Project Structure

```
boiler-spec-management
├── public
│   ├── index.html          # Main HTML file for the application
│   └── favicon.ico         # Favicon for the website
├── src
│   ├── components
│   │   ├── AddSpecPopup.js # Component for adding new specifications
│   │   ├── SpecList.js     # Component for displaying the list of specifications
│   │   └── SpecItem.js     # Component for a single specification item
│   ├── App.js              # Main application component
│   ├── index.js            # Entry point of the React application
│   └── styles.css          # Styles for the application
├── package.json            # npm configuration file
└── README.md               # Documentation for the project
```

## Installation

1. Clone the repository:
   ```
   git clone <repository-url>
   ```
2. Navigate to the project directory:
   ```
   cd boiler-spec-management
   ```
3. Install the dependencies:
   ```
   npm install
   ```

## Usage

To start the application, run:
```
npm start
```
This will launch the application in your default web browser.

## Contributing

Feel free to submit issues or pull requests for any improvements or bug fixes. 

## License

This project is licensed under the MIT License.