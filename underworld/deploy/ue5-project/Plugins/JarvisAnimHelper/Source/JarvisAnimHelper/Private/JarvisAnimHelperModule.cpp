// Copyright JARVIS. Licensed for in-project use.

#include "Modules/ModuleManager.h"

class FJarvisAnimHelperModule : public IModuleInterface
{
public:
    virtual void StartupModule() override {}
    virtual void ShutdownModule() override {}
};

IMPLEMENT_MODULE(FJarvisAnimHelperModule, JarvisAnimHelper)
