# express-tiny

A small Express demo used as an analyzer fixture. Has a few HTTP routes
across users / orders / sessions, with a clear handler → service →
repository chain so path detection has something meaningful to walk.

## Routes

```
POST   /sessions     — public, login
GET    /users        — auth, list users
GET    /users/:id    — auth, fetch one
POST   /users        — auth, create
DELETE /users/:id    — auth, self-delete
GET    /orders       — auth, list mine
POST   /orders       — auth, place + charge
```

## Why it's a fixture

- Not installed. node_modules isn't present; the analyzer doesn't need it
  (parsing is AST-only and external imports are treated as unresolved
  edges, which path detection ignores).
- ~10 small files exercising routes, handlers, middleware, services,
  repositories, and an external client (Stripe stand-in).
- Tracked in this repo so `git ls-files` from the fixture root picks
  up exactly what we want.
