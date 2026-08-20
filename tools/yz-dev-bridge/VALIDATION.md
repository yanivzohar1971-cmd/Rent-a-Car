# Validation

Validated in the Rent_a_Car canonical copy with Node.js 20+.

## Local bridge (`tools/yz-dev-bridge`)

- `npm run syntax`: PASS
- `npm test`: PASS (12 tests, 0 fail)
  - Original store/lifecycle tests: 6 pass (no regression from the previous 6/6 baseline)
  - New Firebase relay tests: 6 pass

## Firebase Functions (`functions`)

- `npm run build` (`tsc`): PASS
- `npm run test:yz-bridge`: PASS (10 tests, 0 fail)

Firebase emulator integration was not executed against a live emulator in this pass. Relay/API tests use an in-memory Firestore stand-in and a fake HTTPS client.

Nothing was deployed to Firebase project `carexpert-94faa`.
