#include <dali-toolkit/dali-toolkit.h>

using namespace Dali;
using namespace Dali::Toolkit;

class DemoController : public ConnectionTracker
{
public:
  DemoController(Application& application)
  : mApplication(application)
  {
    mApplication.InitSignal().Connect(this, &DemoController::Create);
  }

  void Create(Application& application)
  {
    Window window = application.GetWindow();
    window.SetBackgroundColor(Vector4(0.14f, 0.16f, 0.24f, 1.0f));

    TextLabel label = TextLabel::New("Hello DALi!");
    label.SetProperty(Actor::Property::PARENT_ORIGIN, ParentOrigin::CENTER);
    label.SetProperty(Actor::Property::ANCHOR_POINT, AnchorPoint::CENTER);
    label.SetProperty(TextLabel::Property::HORIZONTAL_ALIGNMENT, "CENTER");
    label.SetProperty(TextLabel::Property::TEXT_COLOR, Color::WHITE);
    label.SetProperty(TextLabel::Property::POINT_SIZE, 32.0f);
    window.Add(label);

    Animation anim = Animation::New(2.0f);
    anim.AnimateTo(Property(label, Actor::Property::SCALE),
                   Vector3(1.4f, 1.4f, 1.0f),
                   AlphaFunction::SIN);
    anim.SetLooping(true);
    anim.Play();

    window.KeyEventSignal().Connect(this, &DemoController::OnKeyEvent);
  }

  void OnKeyEvent(const KeyEvent& event)
  {
    if(event.GetState() == KeyEvent::DOWN)
    {
      const std::string keyName = event.GetKeyName();
      if(keyName == "Escape" || keyName == "XF86Back")
      {
        mApplication.Quit();
      }
    }
  }

private:
  Application& mApplication;
};

int DALI_EXPORT_API main(int argc, char** argv)
{
  Application application = Application::New(&argc, &argv);
  DemoController controller(application);
  application.MainLoop();
  return 0;
}
