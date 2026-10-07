// Annotated reference pattern for implementing a Tizen Action provider in
// native C++ (headless Tizen `capp` service-application — this applies
// whether or not the app also uses DALi for its graphics, since this wiring
// is UI-framework-agnostic). Based on the real ActionSampleAppCpp sample,
// generalized with <Category>/<Method> placeholders since the actual
// pure-virtual method list depends on which category you generated with
// actionc.
//
// Do not copy this file verbatim into a project — read the actual generated
// Impl<Category>.h first (from `actionc -l C++`) to get the real method
// signatures, then adapt this pattern around them.

#include <dlog.h>
#include <service_app.h>

#include <memory>
#include <string>

#include "Impl<Category>.h"

#undef LOG_TAG
#define LOG_TAG "YOUR_APP_LOG_TAG"  // pick one consistent tag, grep it in dlogutil later

namespace {

namespace gen = rpc_port::impl<category_lowercase>;  // matches the generated header's namespace

// The class you actually write: subclass the generated ServiceBase and
// override every pure-virtual method it declares (read the generated header
// to know exactly which ones — this is illustrative, not exhaustive).
class <Category>Service : public gen::stub::TizenAction<Category>::ServiceBase {
 public:
  <Category>Service(std::string sender, std::string instance)
      : ServiceBase(std::move(sender), std::move(instance)) {}

  // Called once per connecting client. GetSender()/GetInstance() identify the caller.
  void OnCreate() override {
    dlog_print(DLOG_INFO, LOG_TAG, "client connected: sender=%s", GetSender().c_str());
  }

  void OnTerminate() override {
    dlog_print(DLOG_INFO, LOG_TAG, "client disconnected: sender=%s", GetSender().c_str());
  }

  // Simple case: action takes an entity in, returns a TizenEntityStatus.
  gen::TizenEntityStatus <Method>(gen::TizenEntity<Input> input) override {
    // ... real business logic goes here, e.g. call into your app's own services ...
    return gen::TizenEntityStatus(true, "");
  }

  // Multi-value case: the action's outputSchema wraps a `return` (status) and
  // a `result` (another entity) — the generated method signature puts the
  // extra result entity in a reference out-parameter. Assign it via the
  // entity's constructor or setters; there's no separate builder type.
  gen::TizenEntityStatus <OtherMethod>(gen::TizenEntity<Input> input, gen::TizenEntity<Result>& result) override {
    result = gen::TizenEntity<Result>(/* field values */);
    return gen::TizenEntityStatus(true, "");
  }
};

// Hands a fresh <Category>Service to the stub for every connecting client.
// This Factory object is what you register with Listen() below — contrast
// this with the .NET platform skill, which instead registers a Type and
// relies on reflection to construct instances.
class <Category>Factory : public gen::stub::TizenAction<Category>::ServiceBase::Factory {
 public:
  std::unique_ptr<gen::stub::TizenAction<Category>::ServiceBase> CreateService(
      std::string sender, std::string instance) override {
    return std::make_unique<<Category>Service>(std::move(sender), std::move(instance));
  }
};

// The generated "stub" object — construct one and Listen() on it at startup.
std::unique_ptr<gen::stub::TizenAction<Category>> g_stub;

bool OnCreate(void* /*user_data*/) {
  g_stub = std::make_unique<gen::stub::TizenAction<Category>>();
  try {
    g_stub->Listen(std::make_shared<<Category>Factory>());
  } catch (const gen::stub::Exception& e) {
    dlog_print(DLOG_ERROR, LOG_TAG, "Failed to listen: %s", e.what());
    return false;
  }
  dlog_print(DLOG_INFO, LOG_TAG, "stub is listening");
  return true;
}

void OnTerminate(void* /*user_data*/) { g_stub.reset(); }

void OnAppControl(app_control_h /*app_control*/, void* /*user_data*/) {}

}  // namespace

int main(int argc, char* argv[]) {
  service_app_lifecycle_callback_s cb = {};
  cb.create = OnCreate;
  cb.terminate = OnTerminate;
  cb.app_control = OnAppControl;
  return service_app_main(argc, argv, &cb, nullptr);
}
