# proto files for importers  - /src/profile-logic/import/proto

This directory contains the protocol buffer definition (`.proto`) files required for various importers, along with the corresponding compiled `.js` files.

When adding or changing the `.proto` files in this directory, you should compile the updated `.proto` files using the following command and commit both updated `.proto` and the compiled `.js` files.

```bash
yarn protoc
```