# Random recipe contract (COOK-12, reused by COOK-13)

One rule set, in `backend/src/services/randomRecipe.js` (`pickRandomRecipe`).
The REST route (`backend/src/routes/random.js`) and the MCP `random_recipe`
tool must both call it; do not reimplement the rules.

```
GET /api/recipes/random?vegetarian=1&maxMinutes=30&exclude=<id>,<id>
```

| Param        | Meaning |
|--------------|---------|
| `vegetarian` | `1`/`true`/`yes` keeps only rows with `Recipe.vegetarian = true` (the column, never tags). Absent/other = anything. |
| `maxMinutes` | Positive whole number. Keeps `totalMinutes <= N`; recipes with no `totalMinutes` are excluded. Bad value is a 400. |
| `exclude`    | Recipe ids not to return (comma list and/or repeated param, max 50, else 400). The client sends the recipe it just showed. Unknown ids are ignored. |

Response, always `200` unless a param is invalid:

```json
{ "recipe": { ...same shape as GET /api/recipes/:id... } | null, "matches": 3 }
```

- `matches` counts recipes that satisfy `vegetarian`/`maxMinutes`, ignoring `exclude`.
- `recipe: null, matches: 0` means nothing matches the filters (empty library, or no vegetarian recipes). It is not an error.
- No repeat: `exclude` is honoured whenever any other matching recipe exists. If the only
  matches are excluded (`matches: 1`), that recipe is returned again rather than `null`;
  callers can use `matches === 1` to say "that's the only one".
- Selection is `count` plus a random offset over an `id` ordering, so it does not load
  the library. `pickRandomRecipe(prisma, opts, rng)` takes an injectable `rng` for tests.
