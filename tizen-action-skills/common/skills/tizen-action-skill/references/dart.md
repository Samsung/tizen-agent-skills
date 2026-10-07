# Tizen Action Framework — Flutter-Tizen/Dart provider

This reference covers a **Flutter-Tizen app** acting as a Tizen Action provider: run `actionc -l Dart` → implement the generated `ServiceBase` → `listen()` from a widget's state → declare provider metadata. For the shared conventions (output parameters, subscriptions, request routing, on-device verification), read `common.md`; for a brand-new action, start with `custom-action.md`.

## 1. Check the toolchain and generate the stub

Run `bash scripts/check_toolchain_env.sh` (or `.ps1` on Windows) first. Regenerate checked-in stubs only with the toolchain release they came from — see the compatibility note in `common.md`.

Confirm the category with `bash scripts/list_categories.sh` (or `.ps1`), inspect its `.action` files, then generate into `lib/`:

```bash
mkdir -p lib && cd lib
actionc -a Tizen.Action.<Category> -l Dart -o Impl<Category>
```

`bash scripts/scaffold_action.sh --language Dart --category Tizen.Action.<Category> --out-name Impl<Category>` does the same into `./lib` after checking the toolchain, and lists the handlers to override. The result, `lib/Impl<Category>.dart`, imports `package:tizen_rpc_port/tizen_rpc_port.dart` and defines:

- entity classes (`TizenEntityWebPageInfo extends TizenEntity`) with public fields; optional fields are nullable (`int?`);
- a top-level `abstract class ServiceBase` with `Future<…> on<Method>(…)` handlers — **the class you extend**. Its name is not category-specific, so an app providing two categories must keep the generated files in separate libraries (import one with a prefix);
- `TizenAction<Category>({required ServiceBuilder serviceBuilder})` — the stub;
- `Out<T>` — the holder used for optional single-entity results;
- `ActionServiceProxy`, and a `<Method>Event` delegate class for each subscription action.

Never guess signatures; for `Tizen.Action.Browser`, for instance:

```dart
Future<TizenEntityStatus> onOpenPage(TizenEntityWebPageInfo webPageInfo);
Future<TizenEntityStatus> onGetCurrentPage(Out<TizenEntityWebPageInfo?> result);
Future<TizenEntityStatus> onGetTabs(List<TizenEntityTab> result);
```

## 2. Add Flutter-Tizen RPC wiring

Start with `flutter-tizen create`, then add the `tizen_rpc_port` plugin to `pubspec.yaml`:

```yaml
dependencies:
  flutter:
    sdk: flutter
  tizen_rpc_port:
    path: /path/to/plugins/packages/tizen_rpc_port
```

Adapt `assets/dart_action_pattern.dart` in `lib/main.dart`. The rules:

- Extend the generated `ServiceBase` and implement `onCreate`, `onTerminate`, and every `on<Method>` handler. Handlers are awaited, so they may be `async`.
- Outputs: set `result.value` on an `Out<T?>` (optional single entity), mutate a pre-built required entity, and `add` to a list parameter. Never reassign the parameter itself.
- A subscription handler receives the `<Method>Event` as its last parameter. Keep it, call `event.invoke(…)` per event inside `try/catch`, and drop it in `onTerminate`.
- Keep the `TizenAction<Category>` stub alive in `State`, call `await listen()` once from `initState`, and `close()` it in `dispose`.
- Prefix `print()` logs with an app dlog tag, e.g. `[TIDL_ACTION_MYAPP]`.

## 3. Register every exposed action

In `tizen/tizen-manifest.xml`, the Flutter-Tizen `ui-application` (`exec="Runner.dll"`, `type="dotnet"`) carries one provider entry per action `name`, not the category:

```xml
<ui-application appid="org.example.myactionappdart" exec="Runner.dll" type="dotnet"
                multiple="false" nodisplay="false" taskmanage="true">
  <label>MyActionAppDart</label>
  <metadata key="http://tizen.org/metadata/prefer_dotnet_aot" value="true"/>
  <metadata key="http://tizen.org/metadata/prefer_nuget_cache" value="true"/>
  <metadata key="http://tizen.org/metadata/action/provider" value="Tv_Tizen.Action.Browser_GetCurrentPage"/>
  <metadata key="http://tizen.org/metadata/action/provider" value="Tv_Tizen.Action.Browser_OpenPage"/>
  <metadata key="http://tizen.org/metadata/action/provider" value="Tv_Tizen.Action.Browser_ToCalendar"/>
</ui-application>
<privileges>
  <privilege>http://tizen.org/privilege/datasharing</privilege>
  <privilege>http://tizen.org/privilege/appmanager.launch</privilege>
</privileges>
```

The manifest appid becomes the provider. A default category's `details.appid` names the platform's own app, so callers reach yours through `params.appid` or `action-tool default-app set`. A custom category also needs the `action` and `action/entity` entries, with the schema files in the package `res/` — see `custom-action.md`.

## 4. Build and verify

Build with `flutter-tizen build tpk --debug` and install the `.tpk`. Launch the app before invoking `action-tool` — unlike native providers, the Flutter listener exists only while the UI app runs. Then follow [Verify on a device](common.md#verify-on-a-device), reading logs with `dlogutil` and the app's tag.

## Troubleshooting

- **"Missing concrete implementation of 'ServiceBase.on…'"** — a handler is missing; copy every signature from the generated file.
- **Caller always receives `null` for a result** — the handler reassigned the `Out` parameter or never set `result.value`.
- **`tizen_rpc_port` import fails** — fix the plugin path/version in `pubspec.yaml`, then run `flutter-tizen pub get`.
- **`execute` fails without reaching the app** — `find-appids` does not list it, or the request carries no `appid` and the app is not the default app.
- **Action times out** — launch the Flutter app first and confirm `await _stub.listen()` succeeded in dlog.
- **Calls fail although build and registration look right** — the stub came from a pre-protocol-3 toolchain; re-run step 1 and regenerate.
