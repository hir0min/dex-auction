# Dex auction for new farm
## Set up
Node >= 10.x && yarn > 1.x
```
$ node --version
v16.13.0

$ npm install --global yarn

$ yarn --version
1.22.17
```

Install dependencies
```
$ yarn
```
## Test
1. Compile contract
```
$ yarn compile
```
2. Run tests
```
$ yarn test
```
## Solidity linter and prettiers
1. Run linter to analyze convention and security for smart contracts
```
$ yarn sol:linter
```
2. Format smart contracts
```
$ yarn sol:prettier
```
3. Format typescript scripts for unit tests, deployment and upgrade
```
$ yarn ts:prettier
```

* Note: Updated husky hook for pre-commit
