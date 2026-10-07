# Tizen Action Framework — defining a custom action

This reference covers the schema-authoring half of adding a brand-new Tizen Action: writing the `.action` file (and `.entity` file(s), if the input/output needs a new entity type), then running `actionc` to generate the stub. Implementing the generated `ServiceBase` and registering it with `Listen()` is language-specific and lives in `cs.md`/`cpp.md`/`js.md`/`dart.md`. Once a stub exists, it is indistinguishable from a default category's, so switch to the matching language reference and treat it as one.

**Scope reminder:** this only applies to `"type": "tidl"` actions. If the request is really about an `appControl` or `plugin` action, redirect — see `common.md`.

## What's here

The two schema references are appendices further down this same file:

- [`.action` file schema reference](#action-file-schema-reference) — every field, the two `inputSchema`/`outputSchema` shapes (bare entity ref vs. inline object), and worked examples.
- [`.entity` file schema reference](#entity-file-schema-reference) — the `.entity` format, the single-inheritance chain rooted at `Tizen.Entity`, and how entities map to generated struct/class names.

Alongside them:

| Path | Use it to |
|---|---|
| `../assets/custom_action.template.bare-ref.json` | Fill in a `.action` for the common case: entity ref in, entity ref out |
| `../assets/custom_action.template.inline-schema.json` | Fill in a `.action` for inline object schemas / list results |
| `../assets/custom_entity.template.json` | Fill in a new `.entity` |
| `../scripts/scaffold_custom_action.sh` | Do the template filling and `actionc` run in one shot |

## Step 0 — Confirm this is actually needed

Before writing anything new, run `../scripts/list_categories.sh` (or `.ps1` on Windows) — optionally filtered by a keyword — to check, against what's actually installed on this machine, whether a default category already covers the capability. **If one does, stop here** and go to the matching language reference (`cs.md`/`cpp.md`/`js.md`/`dart.md`) instead. A default category means the framework already ships and resolves the schemas, so there is nothing to author, nothing to package, and nothing to keep in sync.

Only continue past this point if the capability is genuinely new.

## Step 1 — Toolchain check

Confirm `actionc` is actually usable: run `../scripts/check_toolchain_env.sh` (or `.ps1` on Windows). If it reports anything missing, stop and give the developer the exact install command it prints — do not attempt to install the toolchain yourself, since that persistently modifies their shell profile or Windows environment variables.

## Step 2 — Write the `.action` file

Use the [`.action` schema appendix](#action-file-schema-reference) for the full field reference — the two `inputSchema`/`outputSchema` shapes, bare entity ref vs. inline object, are the part that actually matters here — and start from one of the templates in `../assets/`:
- `custom_action.template.bare-ref.json` — input/output is a plain reference to an existing entity type (a default one, or one you're about to define)
- `custom_action.template.inline-schema.json` — input/output is an inline object schema (e.g. a list result)

Keep the `<Prefix>_<Category>_<Method>.action` filename convention — `actionc -i` expects it.

## Step 3 — Write `.entity` file(s), if needed

If the action's input or output needs a domain model that no existing default entity represents (check `../scripts/list_categories.sh --entities` / `.ps1 -Entities` for what already exists), write a new `.entity` file using the [`.entity` schema appendix](#entity-file-schema-reference) and `../assets/custom_entity.template.json`. Entities support single inheritance rooted at `Tizen.Entity` — reuse an existing entity as a base where it makes sense instead of duplicating fields. For a primitive value, use an inline object schema with a named primitive property instead; a bare primitive is not a valid top-level input or output schema.

## Step 4 — Run `actionc` for the target platform

```bash
actionc -i <Prefix>_<Category>_<Method>.action -e <Category>.entity -l <C#|C++|JS|Dart> -o Impl<Category>
```

`-e` is repeatable if there are multiple `.entity` files (or point it at a directory containing them).

`../scripts/scaffold_custom_action.sh` does Steps 2–4 in one shot — it fills in the `.action` template, writes an `.entity` template for each `--new-entity` you name, then invokes `actionc` for the language you specify:

```bash
../scripts/scaffold_custom_action.sh \
  --language 'C#' \
  --prefix MyApp --category My.Action.Memo --method Save \
  --description 'save a memo' \
  --input-type My.Entity.Memo --output-type Tizen.Entity.Status \
  --appid org.example.myapp --out-name ImplMemo \
  --new-entity My.Entity.Memo
```

It refuses to overwrite an existing `.action` file, and it only writes the schema files plus `actionc`'s own output — nothing else in the app project. Each new `.entity` starts with a valid string field named `value`, so `actionc` can generate the stub immediately. Customize that field and regenerate before implementing the provider.

**Pick `-l` based on where the provider is being implemented:** `C#` → `cs.md`, `C++` → `cpp.md`, `JS` → `js.md`, `Dart` → `dart.md`.

## Step 5 — Hand off to the language reference

Once `actionc` succeeds, the generated stub (`ServiceBase` + entity classes) is indistinguishable from what a default category would produce. The schema-definition half is done. Switch to the matching language reference's implementation step:
- `-l C#` → `cs.md`
- `-l C++` → `cpp.md`
- `-l JS` → `js.md`
- `-l Dart` → `dart.md`

Each covers implementing the `ServiceBase` class and registering it. Follow the custom manifest metadata below as well: unlike a default category, a custom category must register its schema resources.

---

## Appendix — Manifest metadata (for reference)

Once the implementation is done, register the custom action in the app's manifest/config file. Use the action's **`name`** field from your `.action` file (e.g., `My_Custom.Action.MyFeature_DoThing`).

Register all three metadata kinds:
- `http://tizen.org/metadata/action` — each packaged `.action` resource filename (e.g., `My_Custom.Action.MyFeature_DoThing.action`)
- `http://tizen.org/metadata/action/entity` — each packaged `.entity` resource filename (e.g., `My.Entity.Feature.entity`)
- `http://tizen.org/metadata/action/provider` — each custom action's exact **`name`** (e.g., `My_Custom.Action.MyFeature_DoThing`)

The package-manager parser loads custom schemas only through the `action` and `action/entity` entries; shipping the files and declaring `action/provider` alone does not register them. The parser records the provider appid from the application declaring the metadata, independently of the `.action` file's `details.appid`. The latter is the schema's fallback target when no registered provider has been selected, so the two appids need not match.

See the matching language reference (`cs.md`/`cpp.md`/`js.md`/`dart.md`) for the exact `tizen-manifest.xml` / `config.xml` syntax.

Custom actions differ from default categories in one packaging respect: your `.action`/`.entity` files are not in the framework data directory, so the app package must ship them. Install them under the app's `res/` and keep them in the source tree next to the code that implements them.

## Troubleshooting

- **`actionc: error: no action files for category '...'`** — the `.action` file's `category` field doesn't match, the file isn't named `<Prefix>_<Category>_<Method>.action`, or it's not in the current directory / not passed via `-i`.
- **`action2tidl` fails to resolve an entity reference** — a referenced `.entity` type isn't default and you forgot to pass its file via `-e`; double check `../scripts/list_categories.sh --entities` (`.ps1 -Entities` on Windows) for what already exists before assuming you need a new entity.
- **Not sure which `-l` to use** — ask which platform the provider is being implemented in (.NET / native C++ / Tizen Web / Flutter-Tizen); that determines both `-l` here and which language reference picks up from Step 5.


<a id="action-file-schema-reference"></a>

# Appendix — `.action` file schema reference

A `.action` file is a JSON document describing one method of one action category. Its shape is enforced by the framework's own validator (`tizen-action/src/common/action_validator.cc`, constant `kMetaSchemaForActionSchema`), reproduced here verbatim:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "version": "v2",
  "title": "Tizen Action Schema",
  "type": "object",
  "required": ["name", "type", "category", "description", "inputSchema", "details"],
  "properties": {
    "name": { "type": "string" },
    "type": { "type": "string", "enum": ["appControl", "plugin", "tidl"] },
    "category": { "type": "string" },
    "description": { "type": "string" },
    "inputSchema": { "$ref": "#/definitions/schema" },
    "outputSchema": { "$ref": "#/definitions/schema" },
    "requiredPrivileges": {
      "type": "array",
      "description": "A list of privileges required to execute the action.",
      "items": { "type": "string", "description": "Each privilege as a URI (e.g., 'http://tizen.org/privilege/internet')" }
    },
    "details": { "type": "object" }
  },
  "definitions": {
    "schema": {
      "type": "object",
      "oneOf": [
        { "required": ["type", "properties"], "properties": {
            "type": { "enum": ["object"] },
            "required": { "type": "array", "items": { "type": "string" } },
            "properties": { "type": "object", "additionalProperties": { "$ref": "#/definitions/propertyDef" } }
        }},
        { "required": ["type"], "properties": {
            "type": { "type": "string", "pattern": "^[^.]+(\\.[^.]+)+$" }
        }}
      ]
    },
    "propertyDef": {
      "type": "object",
      "oneOf": [
        { "required": ["type", "description"], "properties": {
            "type": { "type": "string", "enum": ["string", "integer", "boolean", "number", "object", "array"] },
            "description": { "type": "string" },
            "enum": { "type": "array", "items": { "type": "string" } },
            "minimum": { "type": "integer" },
            "maximum": { "type": "integer" }
        }},
        { "required": ["type"], "properties": { "type": { "type": "string", "pattern": "^[^.]+(\\.[^.]+)+$" } } }
      ]
    }
  }
}
```

## Field reference

| Field | Required? | Meaning |
|---|---|---|
| `name` | yes | Unique action identifier. By convention (not schema-enforced) this also matches the filename: `<Prefix>_<Category>_<Method>` |
| `type` | yes | One of `appControl` \| `plugin` \| `tidl`. **This skill family only handles `tidl`** — see the scope note in `common.md` |
| `category` | yes | Groups related actions and, for `tidl` actions, becomes the generated RPC interface name (e.g. `Tizen.Action.Music` → `TizenActionMusic`) |
| `description` | yes | Human-readable one-liner |
| `inputSchema` | yes | See "The two schema shapes" below |
| `outputSchema` | no | Same shape rules as `inputSchema`; omit if the action truly returns nothing |
| `requiredPrivileges` | no | Array of Tizen privilege URIs, e.g. `http://tizen.org/privilege/internet` |
| `details` | yes | Free-form object whose shape depends on `type`. For `tidl`, `appid` is the fallback target when no registered provider has been selected; provider metadata may register a different app |

## The two `inputSchema`/`outputSchema` shapes

Each of `inputSchema`/`outputSchema` must be **one of**:

**Bare primitive types are not valid top-level schemas.** For example,
`{ "type": "string" }` is rejected during package registration. Wrap a
primitive in a named property of the inline object shape below, or model it as
an entity.

1. **A bare entity reference** — just a dotted type name matching the pattern `^[^.]+(\.[^.]+)+$` (i.e. at least one dot):
   ```json
   { "type": "Tizen.Entity.MusicFile" }
   ```
   This is the common case: the whole input or output IS one entity, defined separately in a `.entity` file (see the [`.entity` appendix](#entity-file-schema-reference)).

2. **An inline object schema**, when the input/output contains a primitive value, a combination of fields, or a list:
   ```json
   {
     "type": "object",
     "required": ["someField"],
     "properties": {
       "someField": { "type": "string", "description": "..." }
     }
   }
   ```
   Each property is either a primitive (`string`/`integer`/`boolean`/`number`/`object`/`array`) with a `description` (and optionally `enum` and/or `minimum`/`maximum`), or itself a dotted entity-type reference (nesting an entity inline). For **list results**, wrap the entity type in an `array` property with `items`:
   ```json
   "result": { "type": "array", "description": "Result entities", "items": { "type": "Tizen.Entity.Content" } }
   ```

## Real-world conventions (not schema-enforced, but followed by all 117 shipped default actions)

- `"version": "v2"` — a version marker on every modern action file.
- Filename == `name` field == `"<Prefix>_<Category>_<Method>"`, e.g. `Tv_Tizen.Action.Browser_OpenPage.action` has `"name": "Tv_Tizen.Action.Browser_OpenPage"`. `actionc -i` actually depends on this naming convention when you feed it a custom action file.
- `category` matches the `Tizen.Action.<X>` portion of `name` (e.g. `name: Tv_Tizen.Action.Browser_OpenPage` → `category: Tizen.Action.Browser`).
- Two extra fields appear on every default action file but aren't schema-validated: `"allowedBackground": "true"|"false"` and `"autoDispose": "true"|"false"` (both as **strings**, not booleans). Include them for consistency with the rest of the framework even though nothing enforces them.

## Worked examples

**1. Bare entity ref in, bare entity ref out** (`TizenActionToolchain/data/actions/Tv_Tizen.Action.Browser_OpenPage.action`):
```json
{
  "version": "v2",
  "name": "Tv_Tizen.Action.Browser_OpenPage",
  "type": "tidl",
  "category": "Tizen.Action.Browser",
  "description": "open a URL in the browser",
  "allowedBackground": "true",
  "autoDispose": "false",
  "inputSchema": { "type": "Tizen.Entity.WebPageInfo" },
  "outputSchema": { "type": "Tizen.Entity.Status" },
  "details": { "appid": "org.tizen.next-browser" }
}
```

**2. Inline output wrapping a status + a list of entities** — this is the pattern for "find"/"search" actions that return multiple results (`Tv_Tizen.Action.Video_FindContent.action`):
```json
{
  "version": "v2",
  "name": "Tv_Tizen.Action.Video_FindContent",
  "type": "tidl",
  "category": "Tizen.Action.Video",
  "description": "search video content with filters",
  "allowedBackground": "true",
  "autoDispose": "false",
  "inputSchema": { "type": "Tizen.Entity.ContentQuery" },
  "outputSchema": {
    "type": "object",
    "properties": {
      "return": { "type": "Tizen.Entity.Status", "description": "status" },
      "result": { "type": "array", "description": "Result entities", "items": { "type": "Tizen.Entity.Content" } }
    }
  },
  "details": { "appid": "HEPsqFNie0.tvplusstandalone" }
}
```

**3. Out of scope, for contrast — a `plugin`-type action** (no `actionc`/`ServiceBase` involved at all):
```json
{
  "name": "tizen_app_launch",
  "type": "plugin",
  "category": "app",
  "description": "Launch an application.",
  "inputSchema": {
    "type": "object",
    "properties": { "appid": { "type": "string", "description": "The ID of the application to launch." } },
    "required": ["appid"]
  },
  "requiredPrivileges": ["http://tizen.org/privilege/appmanager.launch"],
  "outputSchema": {
    "type": "object",
    "properties": { "error": { "type": "string", "description": "Error message, if applicable." } }
  },
  "details": { "pluginPath": "libaction-launch-app.so" }
}
```
And `appControl`-type actions look like `{"name":"pickImage","type":"appControl"}` plus a `details` shaped for app-control launch. See `Part03_Eng.md` in the framework repo — that flow needs no `actionc`/`ServiceBase` either.


<a id="entity-file-schema-reference"></a>

# Appendix — `.entity` file schema reference

An `.entity` file defines one `Tizen.Entity.*` type that `.action` files reference from `inputSchema`/`outputSchema`. Shape:

```json
{
  "typeName": "Tizen.Entity.SomeType",
  "description": "...",
  "base": "Tizen.Entity.ParentType",
  "dataSchema": {
    "type": "object",
    "properties": {
      "FieldName": { "type": "string", "description": "..." }
    }
  }
}
```

| Field | Required? | Meaning |
|---|---|---|
| `typeName` | yes | The dotted entity type name, e.g. `Tizen.Entity.MusicFile` |
| `description` | yes | Human-readable one-liner |
| `base` | no | Parent entity's `typeName`. Omit only for the root `Tizen.Entity` itself |
| `dataSchema.properties` | yes | Each property is either a primitive (`string`/`integer`/`boolean`/`number`) with a `description` (+ optional `enum`), or itself a dotted entity-type reference for a nested entity field |

## Single-inheritance chain

Every entity ultimately inherits from the root `Tizen.Entity`, which defines `Id` and `Extra`:

```json
{
  "typeName": "Tizen.Entity",
  "description": "root base for all entities",
  "dataSchema": {
    "type": "object",
    "properties": {
      "Id": { "type": "string", "description": "Id" },
      "Extra": { "type": "string", "description": "Extra" }
    }
  }
}
```

An entity's `base` chain is single-inheritance only (one parent, not multiple) — think of it like a class hierarchy. When generating code, the generated struct/class includes the base chain's fields plus its own, base-first.

## Worked example: multi-level chain, enum property, nested entity field

`Tizen.Entity.MusicFile` (chain: `MusicFile` → `Files` → `Tizen.Entity`):

```json
{
  "typeName": "Tizen.Entity.MusicFile",
  "description": "a music track",
  "base": "Tizen.Entity.Files",
  "dataSchema": {
    "type": "object",
    "properties": {
      "Title": { "type": "string", "description": "Title" },
      "Artist": { "type": "Tizen.Entity.Artist", "description": "Artist" },
      "Album": { "type": "Tizen.Entity.Album", "description": "Album" },
      "Duration": { "type": "integer", "description": "Duration" },
      "Genre": { "type": "string", "description": "Genre" },
      "TrackNumber": { "type": "integer", "description": "TrackNumber" },
      "Affinity": { "type": "string", "description": "Affinity", "enum": ["liked", "unliked", "unset"] }
    }
  }
}
```

Notice `Artist` and `Album` are themselves entity references (`Tizen.Entity.Artist`, `Tizen.Entity.Album`) rather than primitives — nesting one entity inside another this way is normal and expected.

## How entities map to generated code

`actionc`/`tidlc` turn each entity into a struct/class named by stripping the dots and PascalCasing the result: `Tizen.Entity.MusicFile` → `TizenEntityMusicFile`. The generated type inherits from its base chain's generated type the same way the `.entity` file's `base` field describes (e.g. `TizenEntityMusicFile : TizenEntityFiles`), with getters/setters (or public fields, depending on the target language) for every property in `dataSchema.properties`, in addition to the inherited `Id`/`Extra` fields from the root.

When writing a new `.entity` file, always set `base` to at least `Tizen.Entity` (or a more specific existing entity if one fits) — don't invent a rootless entity, since the framework's code generation assumes the chain terminates at `Tizen.Entity`.
