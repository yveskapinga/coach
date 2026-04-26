# Coach-Life API

Backend Fastify + PostgreSQL pour l'application PWA de discipline personnelle.

## Stack

- **Fastify** (HTTP framework)
- **pg** (driver PostgreSQL natif, pas d'ORM)
- **bcrypt** (hash mots de passe)
- **@fastify/jwt** (tokens JWT)
- **node:test** (tests natifs Node.js)

## Architecture

- `database/migrations/001_initial.sql` — Schema complet, RLS, indexes, fonctions métier
- `src/db.js` — Pool pg avec injection `SET app.user_id`
- `src/auth/` — Hash, tokens, routes auth
- `src/days/` — Workflow jour (morning, execution, evening, gratitude)
- `src/concepts/` — Suggestion de concepts normalisés
- `src/analytics/` — Score et patterns
- `src/middleware/auth.js` — Vérification JWT
- `tests/app.test.js` — Tests complets (auth, isolation, workflow, scoring)

## Sécurité

- **RLS** activé sur toutes les tables métier
- `SET app.user_id` injecté à chaque requête
- Pas de logique métier backend — tout passe par les fonctions SQL
- Passwords hashés avec bcrypt

## Prérequis

- Node.js >= 20
- PostgreSQL >= 15 (avec extension `pgvector`)

## Setup

```bash
cp .env.example .env
# Éditer .env avec vos credentials PostgreSQL

# Installer les dépendances
npm install

# Créer la base de données et l'utilisateur (psql en superuser)
createdb coach_life
# Activer l'extension vector
psql coach_life -c "CREATE EXTENSION IF NOT EXISTS vector;"

# Lancer les migrations
npm run migrate

# Démarrer le serveur
npm run dev
```

## Tests

```bash
npm test
```

## Workflow Utilisateur

1. `POST /auth/register` → créer un compte
2. `POST /auth/login` → récupérer access_token
3. `POST /days` → créer une journée
4. `POST /days/:id/morning` → actions (1-3) + focus
5. `PATCH /days/:id/execution` → mettre à jour les statuts
6. `POST /days/:id/evening` → analyse, leçons, règles
7. `POST /days/:id/gratitude` → 3 items
8. `GET /days/:id/score` → score final
9. `GET /patterns` → tendances sur 30 jours

## API Endpoints

### Auth
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/reset-request`
- `POST /auth/reset-password`

### Days
- `POST /days`
- `POST /days/:id/morning`
- `PATCH /days/:id/execution`
- `POST /days/:id/evening`
- `POST /days/:id/gratitude`
- `GET /days/:id/score`

### Concepts
- `GET /concepts/suggest?type=ACTION&q=sport`

### Analytics
- `GET /patterns`

## Fonctions SQL métier

- `create_day(user_id, date)`
- `set_morning(user_id, day_id, actions[], focus)`
- `update_execution(user_id, day_id, updates)`
- `set_evening(user_id, day_id, ...)`
- `set_gratitude(user_id, day_id, items[])`
- `get_day_score(user_id, day_id)`
- `get_user_patterns(user_id)`
- `match_or_create_concept(type, text)`
- `suggest_concepts(type, query)`
# coach
