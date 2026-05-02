# Unit Converter DevTool

A static, browser-based unit converter built with vanilla JavaScript, HTML, and CSS.

## Features

- Multiple conversion categories:
	- Length / Distance
	- Area
	- Volume / Liquid (includes US and UK variants)
	- Weight / Mass
	- Temperature
	- Time
	- Speed
	- Data / Digital Storage (decimal and binary)
	- Energy
	- Power
	- Angle
	- Fuel Economy
- Live conversion while typing
- Input validation for numeric values
- Formula-driven conversion support for Temperature and Fuel Economy
- Swap units button
- Copy result button
- Precision selector
- Multi-unit output list for the selected category
- Responsive desktop and mobile layout

## Project Structure

- index.html: app layout and UI shell
- styles.css: theme and responsive styling
- units.js: category and unit definitions
- converter.js: conversion and formatting logic
- app.js: event wiring, rendering, and interactions

## How It Works

### Factor categories

For factor-based categories, conversion follows:

- baseValue = inputValue * fromFactor
- result = baseValue / toFactor

### Formula categories

Custom conversion formulas are used for:

- Temperature
- Fuel Economy

## Usage

Open index.html in any modern browser.

No build step or external API is required.

## License

See LICENSE file for details.

