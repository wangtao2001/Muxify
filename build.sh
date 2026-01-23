#!/bin/bash

npm run build

mkdir -p release
vsce package --allow-missing-repository --out release
