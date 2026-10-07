# Tizen Action Framework — defining a custom action

This reference covers the schema-authoring half of adding a brand-new Tizen Action: writing the `.action` file (and `.entity` file(s), if the input/output needs a new entity type), then running `actionc` to generate the stub. Implementing the generated `ServiceBase` and registering it with `Listen()` is language-specific and lives in `cs.md`/`cpp.md`/`js.md`/`dart.md`.

**Scope reminder:** this only applies to `"type": "tidl"` actions. If the request is really about an `appControl` or `plugin` action, redirect — see `common.md`.

The framework's complete sample of this path is `samples/tidl-custom-action` in the `tizen-action` repository (a Bookmark category with Save/Get/List and a Watch subscription), and Part 05 of the framework guide walks through it.

## Contents

- [Step 0 — Confirm this is actually needed](#step-0--confirm-this-is-actually-needed)
- [Steps 1–5 — Write, generate, hand off](#step-1--toolchain-check)
- [Method order is ABI](#method-order-is-abi)
- [Manifest metadata and packaging](#manifest-metadata-and-packaging)
- [Troubleshooting](#troubleshooting)
- [Appendix — `.action` file reference](#action-file-schema-reference)
- [Appendix — `.entity` file reference](#entity-file-schema-reference)

| Path | Use it to |
|---|---|
| `assets/custom_action.template.bare-ref.json` | Fill in a `.action` for the common case: entity ref in, entity ref out |
| `assets/custom_action.template.inline-schema.json` | Fill in a `.action` for inline object schemas / list results |
| `assets/custom_entity.template.json` | Fill in a new `.entity` |
| `scripts/scaffold_custom_action.sh` | Do the template filling and `actionc` run in one shot |

## Step 0 — Confirm this is actually needed

Before writing anything new, run `bash scripts/list_categories.sh` (or `.ps1` on Windows) — optionally filtered by a keyword — to check whether a default category already covers the capability. **If one does, stop here** and go to the matching language reference instead. A default category means the framework already ships and resolves the schemas, so there is nothing to author, nothing to package, and nothing to keep in sync.

## Step 1 — Toolchain check

Run `bash scripts/check_toolchain_env.sh` (or `.ps1` on Windows). If it reports anything missing, stop and give the developer the setup command it prints — do not install the toolchain yourself.

## Step 2 — Write the `.action` file

Use the [`.action` appendix](#action-file-schema-reference) for the field reference and start from one of the templates in `assets/`:
- `custom_action.template.bare-ref.json` — input/output is a plain reference to an existing entity type (a default one, or one you're about to define)
- `custom_action.template.inline-schema.json` — input/output is an inline object schema (e.g. a list result)

Keep the `<Prefix>_<Category>_<Method>.action` filename convention — `actionc -i` parses the category out of it. Use a category and entity namespace that cannot be mistaken for a platform one (the sample uses `App_Example.Action.Bookmark_*` and `Example.Entity.Bookmark`), and set `details.appid` to the app that provides the action.

## Step 3 — Write `.entity` file(s), if needed

If the input or output needs a domain model that no existing entity represents (check `bash scripts/list_categories.sh --entities` / `.ps1 -Entities`), write a new `.entity` file using the [`.entity` appendix](#entity-file-schema-reference) and `assets/custom_entity.template.json`. Reuse an existing entity as `base` where it fits instead of duplicating fields. For a single primitive value, use an inline object schema with a named primitive property; a bare primitive is not a valid top-level input or output schema.

## Step 4 — Run `actionc`

```bash
actionc -i <Prefix>_<Category>_<MethodA>.action \
        -i <Prefix>_<Category>_<MethodB>.action \
        -e <entities-dir-or-file> -l <C#|C++|JS|Dart> -o Impl<Category>
```

Pass **every** action of the category, sorted by full action name (see [Method order is ABI](#method-order-is-abi)). A run with only one `-i` generates an interface with only that method. `-e` is repeatable and accepts a directory.

`bash scripts/scaffold_custom_action.sh` does Steps 2–4 in one shot: it fills in the `.action` template, writes an `.entity` template for each `--new-entity`, then regenerates the stub from every `*_<Category>_*.action` in the schema directory, sorted, plus every `.entity` there:

```bash
bash scripts/scaffold_custom_action.sh \
  --language 'C#' \
  --prefix MyApp --category My.Action.Memo --method Save \
  --description 'save a memo' \
  --input-type My.Entity.Memo --output-type Tizen.Entity.Status \
  --appid org.example.myapp --out-name ImplMemo \
  --new-entity My.Entity.Memo
```

It refuses to overwrite an existing `.action` file and only writes the schema files plus `actionc`'s own output. Each new `.entity` starts with a single string field named `value` so `actionc` can generate immediately; replace it with the real fields and regenerate before implementing. Run it again with another `--method` to add an action to the same category.

## Step 5 — Hand off to the language reference

Once `actionc` succeeds, the generated stub (`ServiceBase` + entity classes) works like a default category's. Switch to the language reference (`-l C#` → `cs.md`, `C++` → `cpp.md`, `JS` → `js.md`, `Dart` → `dart.md`) for implementation and registration, and apply the [manifest metadata](#manifest-metadata-and-packaging) below as well: unlike a default category, a custom category must ship and register its schema files.

## Method order is ABI

TIDL method ids are positional inside a category. For an app category the device sorts the installed action names; `actionc -i` keeps the command-line order. So:

- Always pass every `-i` of the category, sorted by full action name.
- Adding an action whose name sorts **before** an existing one renumbers every method after it and breaks already-installed callers. Give new actions names that sort last, or ship them in a new category.
- Never add an `eventSchema` to an action that has shipped — delegate ids are positional too. Add a new action instead.
- Never change the notation of a shipped property (moving it in or out of `required`, switching `type`↔`base`, reordering `oneOf`) — each changes the wire encoding. Append new fields instead.

## Manifest metadata and packaging

Register all three metadata kinds (each value may also be a `;`-separated list):
- `http://tizen.org/metadata/action` — each packaged `.action` resource filename (e.g., `App_Example.Action.Bookmark_Save.action`)
- `http://tizen.org/metadata/action/entity` — each packaged `.entity` resource filename (e.g., `Example.Entity.Bookmark.entity`); omit it when the actions use only installed entities
- `http://tizen.org/metadata/action/provider` — each action's exact **`name`** (e.g., `App_Example.Action.Bookmark_Save`)

The package-manager parser loads custom schemas only through the `action` and `action/entity` entries; declaring `action/provider` alone does not register them. It records the provider appid from the application that declares the metadata, and `details.appid` must name that same app — a request without `params.appid` goes to `details.appid`, and the framework refuses to call an app that is not a registered provider.

Ship the `.action`/`.entity` files in the package `res/` directory (for a `.wgt`, the widget's `res/` directory) and keep them in the source tree next to the code that implements them. See the language reference for the exact `tizen-manifest.xml` / `config.xml` syntax and the install rules.

## Troubleshooting

- **`actionc: error: no action files for category '...'`** — the `.action` filename is not `<Prefix>_<Category>_<Method>.action`, or it was not passed via `-i`.
- **`action2tidl` fails to resolve an entity reference** — a referenced `.entity` type isn't installed and you didn't pass its file via `-e`; check `bash scripts/list_categories.sh --entities` before assuming you need a new entity.
- **Generated stub has fewer methods than the category** — not every `.action` of the category was passed with `-i`.
- **Install fails in the metadata parser** — a schema did not validate (run `python3 -m json.tool` on it, then compare it with the appendix), a metadata value does not match a file in `res/`, or the action's `providerPrivilegeLevel` is above the package's signing level.
- **Not sure which `-l` to use** — ask which platform the provider is implemented in (.NET / native C++ / Tizen Web / Flutter-Tizen).


<a id="action-file-schema-reference"></a>

# Appendix — `.action` file reference

A `.action` file is a JSON document describing one method of one action category. The framework validates it against the meta schema `kMetaSchemaForActionSchema` in `src/common/action_validator.cc` of the `tizen-action` repository; read that file when a field below is not enough.

## Field reference

| Field | Required? | Meaning |
|---|---|---|
| `version` | no | Use `"v2"` |
| `name` | yes | Unique action identifier, equal to the filename: `<Prefix>_<Category>_<Method>` |
| `type` | yes | `appControl` \| `plugin` \| `tidl`. **This skill only handles `tidl`** |
| `category` | yes | Groups related actions; for `tidl` it becomes the generated interface (`Example.Action.Bookmark` → `ExampleActionBookmark`) |
| `description` | yes | What the action does, written for the Agent that picks it |
| `inputSchema` | yes | See [the schema shapes](#the-inputschema--outputschema-shapes) |
| `outputSchema` | no | Same shapes as `inputSchema`; omit only if the action truly returns nothing |
| `eventSchema` | no | Makes the action a subscription; see [Subscription actions](#subscription-actions) |
| `details` | yes | For `tidl`, `{ "appid": "<provider appid>" }` — the default target when a request names no app |
| `requiredPrivileges` | no | Privilege URIs the caller needs, e.g. `http://tizen.org/privilege/internet` |
| `requiresConfirmation` | no | Boolean; the Agent must get the user's approval before executing |
| `consent` | no | Declares the approval prompt (purpose, modes, risk level, localized messages); implies `requiresConfirmation` — see Part 02 of the guide |
| `providerPrivilegeLevel` | no | `public` (default) / `partner` / `platform`: the minimum signing level to declare or provide the action, and to see or call it |
| `allowedBackground` | no | Boolean, `tidl` only, default `false`: allow background execution |
| `autoDispose` | no | Boolean, `tidl` only, default `false`: let rpc-port dispose the connection after the request; must be `false` with `eventSchema` |

Write the booleans as JSON booleans. Older catalogue files used the strings `"true"`/`"false"`, which the parser still accepts.

## The `inputSchema` / `outputSchema` shapes

Each must be **one of**:

1. **A bare entity reference** — a dotted type name:
   ```json
   { "type": "Tizen.Entity.WebPageInfo" }
   ```
2. **An inline object schema**, for primitive values, several fields, or a list:
   ```json
   {
     "type": "object",
     "required": ["id"],
     "properties": {
       "id": { "type": "string", "description": "Stable bookmark identifier" }
     }
   }
   ```

Bare primitives such as `{ "type": "string" }` are rejected at install. In an output, a property named `return` (usually `Tizen.Entity.Status`) becomes the method's return value and every other property an out-parameter.

Each property takes one of these forms:

| Form | Example | Generated as |
|---|---|---|
| primitive | `{ "type": "string", "description": "…" }` (`string`/`integer`/`boolean`/`number`/`object`/`array`, with optional `enum`, `minimum`, `maximum`) | the language's primitive |
| sized integer | `{ "type": "integer", "format": "int64" }` (also `uint32`, `uint64`) | TIDL `long` / `u32` / `u64` |
| entity reference | `{ "type": "Tizen.Entity.Photo", "description": "…" }` | the entity class (sliced to that type) |
| polymorphic slot | `{ "base": "Tizen.Entity.Content", "description": "…" }` | `box<…>`, keeps a derived entity's runtime type (`TypeName`) |
| alternatives | `{ "oneOf": [ {…}, {…} ], "description": "…" }` | `variant<…>`, in declaration order; never two branches of the same JSON type |
| list | `{ "type": "array", "description": "…", "items": { "type": "Tizen.Entity.Tab" } }` | list/vector of the item type |

`required` decides optionality: with no `required` list every property is required; with a list, the properties missing from it are generated as optional types.

## Subscription actions

An `eventSchema` turns the action into a subscription: `outputSchema` is the immediate acknowledgement, then the provider keeps sending events until the caller cancels or disconnects.

```json
{
  "version": "v2",
  "name": "App_Example.Action.Bookmark_Watch",
  "type": "tidl",
  "category": "Example.Action.Bookmark",
  "description": "Subscribe to bookmark changes: reports every bookmark saved from now on",
  "allowedBackground": true,
  "autoDispose": false,
  "inputSchema": { "type": "object", "properties": {} },
  "outputSchema": { "type": "Tizen.Entity.Status" },
  "eventSchema": {
    "description": "Fired whenever a bookmark is saved or updated",
    "once": false,
    "type": "Example.Entity.Bookmark"
  },
  "details": { "appid": "org.example.tidlcustomactionsample" }
}
```

`eventSchema` takes the same shapes as `outputSchema`, plus `description` (when the event fires) and `once` (`true` closes after the first event). It requires `"type": "tidl"` and `"autoDispose": false`. `actionc` turns it into a `WatchEvent` delegate passed as the method's last parameter — see `common.md`.

## Worked example — object input, status plus entity output

`App_Example.Action.Bookmark_Get` from the framework sample:

```json
{
  "version": "v2",
  "name": "App_Example.Action.Bookmark_Get",
  "type": "tidl",
  "category": "Example.Action.Bookmark",
  "description": "Get a saved bookmark by its stable identifier",
  "allowedBackground": true,
  "autoDispose": false,
  "inputSchema": {
    "type": "object",
    "properties": {
      "id": { "type": "string", "description": "Identifier of the bookmark to retrieve" }
    },
    "required": ["id"]
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "return": { "type": "Tizen.Entity.Status", "description": "Operation status" },
      "bookmark": { "type": "Example.Entity.Bookmark", "description": "Retrieved bookmark" }
    }
  },
  "details": { "appid": "org.example.tidlcustomactionsample" }
}
```

Generated C++: `TizenEntityStatus Get(std::string id, ExampleEntityBookmark& bookmark)`. With `"required": ["return"]` in the output, `bookmark` would instead be an optional out-parameter.


<a id="entity-file-schema-reference"></a>

# Appendix — `.entity` file reference

An `.entity` file defines one entity type that `.action` files reference:

```json
{
  "typeName": "Example.Entity.Bookmark",
  "description": "A bookmark exposed by the example application",
  "base": "Tizen.Entity",
  "dataSchema": {
    "type": "object",
    "required": ["Url", "Title"],
    "properties": {
      "Url": { "type": "string", "description": "Bookmark URL" },
      "Title": { "type": "string", "description": "Human-readable bookmark title" },
      "Note": { "type": "string", "description": "Free-form note" }
    }
  }
}
```

| Field | Required? | Meaning |
|---|---|---|
| `typeName` | yes | The dotted entity type name |
| `description` | yes | Human-readable one-liner |
| `base` | yes for new entities | Parent entity's `typeName`; at least `Tizen.Entity` |
| `dataSchema.properties` | yes | The property forms from the `.action` appendix |
| `dataSchema.required` | no | Properties left out of it are generated as optional |
| `entityResolver` | no | Declares a `<Category>_Get<Entity>ByIds` action that refreshes instances by id; see Part 02 of the guide |

## Inheritance and generated names

Every entity inherits, through single inheritance, from the root `Tizen.Entity`, which defines optional `Id` and `Extra` strings. The generated class strips the dots (`Example.Entity.Bookmark` → `ExampleEntityBookmark`), inherits the generated class of its `base`, and carries the base chain's fields first. Property names become generated getters/setters/fields, so treat published names as part of the contract.
