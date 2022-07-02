# Opensea Historical Data to CSV

## Setup

- Requires [Node](https://nodejs.org/en/download/) installed. Minimum version v16.13.0
- Requires dependencies to be installed. Run `npm install` at the root of the folder to install the node dependencies.
- Requires an Opensea API key. To add your key, copy the file `.env.template` to just `.env` and replace the "12345" with your API key.

## Running

- Run the script directly using for example `npm run start --slug=doodles-official` in the terminal at the root of the folder.

#### Parameters

`--slug` The Opensea slug of the collection. This is required if contract is not specified.
`--contract` The contract address of the collection. This is required if slug is not specified.
`--outputFileName` The name of the CSV file to output. Optional.
`--daysback` Number of days worth of data until the current date to pull back from Opensea. Optional.
