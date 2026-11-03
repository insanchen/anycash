# AnyCash: seed script specification
Applies to development and initial startup only. It does not run on every boot.

## 1. Behavior
- Empty database: run the full seed.
- Existing database: add only missing records and never overwrite user data.

## 2. Admin user
- Read `ADMIN_EMAIL` and `ADMIN_PASSWORD` from the environment.
- Hash the password before insertion. Never store plaintext passwords.
- Create the user only when the users table is empty or the target email is absent.
- Role: `owner`.

## 3. Category seed
- Source: `lib/db/seed/categories.json`.
- Structure: top-level `income`, `expense`, `transfer`, and `adjustment` keys.
- Set `is_default=true` for seeded records unless another rule applies.
- Set `is_hidden=false` for seeded records.
- Skip duplicate `name` + `type` + `parent_id` values.

## 4. Idempotency contract
- Every insert uses an upsert by unique key or checks for the row before it writes.
- The seed process must not delete or change existing users or categories.

## 5. Seed file shape
- Top-level key: `version`.
- Keys: `income`, `expense`, `transfer`, `adjustment`.
- Each item: `name`, `parent?: string|null`, optional `children[]`.

Example:
```json
{
  "version": 1,
  "income": [
    { "name": "Salary", "children": [{ "name": "Main Job" }, { "name": "Bonus" }] },
    { "name": "Investment" },
    { "name": "Gift" }
  ],
  "expense": [
    { "name": "Food", "children": [{ "name": "Groceries" }, { "name": "Eating Out" }] },
    { "name": "Transport" },
    { "name": "Utilities" }
  ],
  "transfer": [],
  "adjustment": []
}
```

## 6. Validation before finish
- Exit with a non-zero status on a parse, hashing, or database connection failure.
- An idempotent rerun should add zero rows and should not fail.
