/* Annotated reference pattern for implementing a Tizen Action provider in a
 * Tizen Web app (WRT, plain JS, no npm/bundler), generalized with
 * <Category>/<Method> placeholders since the actual on<Method> stub list
 * depends on which category you generated with actionc.
 *
 * Do not copy this file verbatim into a project — read the actual generated
 * Impl<Category>.js first (from `actionc -l JS`) to get the real on<Method>
 * parameter lists, then adapt this pattern around them. Load Impl<Category>.js
 * via a <script> tag BEFORE this file in index.html.
 */

(function () {
  'use strict';

  var stub = null;

  // The class you actually write: extend the generated <Interface>ServiceBase
  // and override every on<Method> stub it declares (read the generated file
  // to know exactly which ones — this is illustrative, not exhaustive).
  // NOTE: the generated ServiceBase class name is NOT namespaced (e.g. it's
  // literally `TizenActionBrowserServiceBase`, not `MyApp.TizenActionBrowserServiceBase`),
  // so if your app ever implements two categories, make sure their class
  // names don't collide.
  class <Category>Service extends <Interface>ServiceBase {
    constructor(sender, instance) {
      super(sender, instance);
    }

    // Called once per connecting client.
    onCreate() {
      console.log('Client connected: ' + this.sender + '/' + this.instance);
    }

    onTerminate() {
      console.log('Client disconnected: ' + this.sender + '/' + this.instance);
    }

    // Handlers run SYNCHRONOUSLY: the dispatcher serializes the returned
    // TizenEntityStatus right away, so never make them async.
    // Simple case: action takes an entity in, returns a TizenEntityStatus.
    on<Method>(input) {
      // ... real business logic goes here, e.g. call into your app's own logic ...

      let status = new TizenEntityStatus();
      status.Success = true;
      status.Reason = "";
      return status;
    }

    // Multi-value case: the action's outputSchema wraps a `return` (status)
    // and a `result`. What the dispatcher passes in depends on the schema
    // (read the generated _dispatch<Method> to be sure):
    //   optional entity -> a holder { value: null }; set result.value
    //   required entity -> a pre-built entity; set its fields
    //   list            -> a pre-built array; push into it
    on<OtherMethod>(input, result) {
      const value = new TizenEntity<Result>();
      value.SomeField = "...";
      result.value = value;  // optional-entity case

      let status = new TizenEntityStatus();
      status.Success = true;
      status.Reason = "";
      return status;
    }

    // Subscription case (the .action declares an eventSchema): the generated
    // <Interface>_<Method>Event is the LAST parameter. Keep it, call
    // event.invoke(entity) per event inside try/catch, drop it in onTerminate().
  }

  // Registration happens via a CLOSURE FACTORY FUNCTION (C# registers a Type,
  // C++ a Factory instance, Dart a builder function).
  // The function is called once per connecting client to produce a fresh
  // <Category>Service.
  function start() {
    if (typeof tizen === 'undefined') {
      console.error('tizen global object is not available!');
      return;
    }
    if (!tizen.rpcport) {
      console.error('tizen.rpcport WebAPI is not available!');
      return;
    }
    try {
      stub = new <Interface>(function (sender, instance) {
        return new <Category>Service(sender, instance);
      });
      stub.listen();
      console.log('Listening on port "<Interface>"');
    } catch (e) {
      console.error('Listen failed: ' + e.message);
    }
  }

  // Registration runs once the page (and the tizen.rpcport WebAPI) is ready.
  window.addEventListener('load', function () {
    start();
  });
})();
