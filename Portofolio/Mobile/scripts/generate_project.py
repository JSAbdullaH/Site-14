#!/usr/bin/env python3
"""Writes SITE14.xcodeproj from the folders, so adding a Swift file needs no Xcode clicking.

    python3 scripts/generate_project.py

Shared/  is compiled into both apps.  iOS/  is the iPhone app.  Watch/  is the Apple Watch app,
embedded in the iPhone app. Settings that change per install (server, bundle id, team) are at the top.
"""
import hashlib
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PROJECT_SETTINGS = {
    "SITE14_API_URL": "https://site-14-back-end-testing-xaxhq7.cranl.net",
    "SITE14_IOS_BUNDLE_ID": "sa.site14.tracker",
    "SITE14_APP_DOMAIN": "",
    "DEVELOPMENT_TEAM": "",
    "MARKETING_VERSION": "1.0",
    "CURRENT_PROJECT_VERSION": "1",
}


def uid(*parts):
    return hashlib.md5("/".join(parts).encode()).hexdigest()[:24].upper()


def q(value):
    if isinstance(value, list):
        return "(\n" + "".join(f"\t\t\t\t\t{q(v)},\n" for v in value) + "\t\t\t\t)"
    s = str(value)
    if re.fullmatch(r"[A-Za-z0-9_./]+", s):
        return s
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n") + '"'


def files_in(folder, exts):
    out = []
    for dirpath, dirnames, filenames in os.walk(os.path.join(ROOT, folder)):
        dirnames[:] = sorted(d for d in dirnames if not d.endswith(".xcassets"))
        for name in sorted(filenames):
            if os.path.splitext(name)[1] in exts:
                out.append(os.path.relpath(os.path.join(dirpath, name), ROOT))
    return out


objects = {}


def add(oid, isa, **fields):
    objects[oid] = (isa, fields)
    return oid


# ---------- files and groups ----------
groups = {}


def group_for(path):
    """The group for a folder, created with its parents."""
    if path in groups:
        return groups[path]
    oid = add(uid("group", path), "PBXGroup", children=[], path=os.path.basename(path), sourceTree="<group>")
    groups[path] = oid
    parent = os.path.dirname(path)
    parent_id = group_for(parent) if parent else MAIN
    objects[parent_id][1]["children"].append(oid)
    return oid


MAIN = add(uid("main"), "PBXGroup", children=[], sourceTree="<group>")
groups[""] = MAIN

FILE_TYPES = {
    ".swift": "sourcecode.swift",
    ".plist": "text.plist.xml",
    ".entitlements": "text.plist.entitlements",
    ".xcassets": "folder.assetcatalog",
    ".xcprivacy": "text.xml",
}


def file_ref(path):
    oid = uid("file", path)
    if oid not in objects:
        ext = os.path.splitext(path)[1]
        add(oid, "PBXFileReference", lastKnownFileType=FILE_TYPES[ext], path=os.path.basename(path), sourceTree="<group>")
        objects[group_for(os.path.dirname(path))][1]["children"].append(oid)
    return oid


shared = files_in("Shared", {".swift"})
TARGETS = {
    "ios": {
        "name": "SITE14",
        "product": "SITE14.app",
        "sources": shared + files_in("iOS", {".swift"}),
        "resources": ["iOS/Assets.xcassets", "Shared/PrivacyInfo.xcprivacy"],
        "other": ["iOS/Info.plist", "iOS/SITE14.entitlements"],
        "settings": {
            "ASSETCATALOG_COMPILER_APPICON_NAME": "AppIcon",
            "ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME": "AccentColor",
            "INFOPLIST_FILE": "iOS/Info.plist",
            "LD_RUNPATH_SEARCH_PATHS": ["$(inherited)", "@executable_path/Frameworks"],
            "PRODUCT_BUNDLE_IDENTIFIER": "$(SITE14_IOS_BUNDLE_ID)",
            "PRODUCT_NAME": "SITE14",
            "SDKROOT": "iphoneos",
            "SUPPORTED_PLATFORMS": "iphoneos iphonesimulator",
            "SUPPORTS_MACCATALYST": "NO",
            "TARGETED_DEVICE_FAMILY": "1",
            "ENABLE_PREVIEWS": "YES",
        },
    },
    "watch": {
        "name": "SITE14 Watch",
        "product": "SITE14Watch.app",
        "sources": shared + files_in("Watch", {".swift"}),
        "resources": ["Watch/Assets.xcassets", "Shared/PrivacyInfo.xcprivacy"],
        "other": ["Watch/Info.plist"],
        "settings": {
            "ASSETCATALOG_COMPILER_APPICON_NAME": "AppIcon",
            "ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME": "AccentColor",
            "INFOPLIST_FILE": "Watch/Info.plist",
            "LD_RUNPATH_SEARCH_PATHS": ["$(inherited)", "@executable_path/Frameworks"],
            "PRODUCT_BUNDLE_IDENTIFIER": "$(SITE14_IOS_BUNDLE_ID).watchkitapp",
            "PRODUCT_NAME": "SITE14Watch",
            "SDKROOT": "watchos",
            "SUPPORTED_PLATFORMS": "watchos watchsimulator",
            "SKIP_INSTALL": "YES",
            "TARGETED_DEVICE_FAMILY": "4",
            "ENABLE_PREVIEWS": "YES",
        },
    },
}

for t in TARGETS.values():
    for path in t["sources"] + t["resources"] + t["other"]:
        file_ref(path)

PRODUCTS = add(uid("products"), "PBXGroup", children=[], name="Products", sourceTree="<group>")
objects[MAIN][1]["children"].append(PRODUCTS)
for key, t in TARGETS.items():
    t["product_ref"] = add(
        uid("product", key), "PBXFileReference",
        explicitFileType="wrapper.application", includeInIndex="0", path=t["product"], sourceTree="BUILT_PRODUCTS_DIR",
    )
    objects[PRODUCTS][1]["children"].append(t["product_ref"])

# ---------- configurations ----------
COMMON = {
    "ALWAYS_SEARCH_USER_PATHS": "NO",
    "CLANG_ENABLE_MODULES": "YES",
    "CLANG_ENABLE_OBJC_ARC": "YES",
    "CODE_SIGN_STYLE": "Automatic",
    "COPY_PHASE_STRIP": "NO",
    "ENABLE_STRICT_OBJC_MSGSEND": "YES",
    "ENABLE_USER_SCRIPT_SANDBOXING": "YES",
    "GCC_C_LANGUAGE_STANDARD": "gnu17",
    "IPHONEOS_DEPLOYMENT_TARGET": "17.0",
    "WATCHOS_DEPLOYMENT_TARGET": "10.0",
    "LOCALIZATION_PREFERS_STRING_CATALOGS": "YES",
    "SWIFT_EMIT_LOC_STRINGS": "YES",
    "SWIFT_VERSION": "5.0",
    **PROJECT_SETTINGS,
}
DEBUG = {
    "DEBUG_INFORMATION_FORMAT": "dwarf",
    "ENABLE_TESTABILITY": "YES",
    "GCC_OPTIMIZATION_LEVEL": "0",
    "GCC_PREPROCESSOR_DEFINITIONS": ["DEBUG=1", "$(inherited)"],
    "ONLY_ACTIVE_ARCH": "YES",
    "SWIFT_ACTIVE_COMPILATION_CONDITIONS": "DEBUG $(inherited)",
    "SWIFT_OPTIMIZATION_LEVEL": "-Onone",
}
RELEASE = {
    "DEBUG_INFORMATION_FORMAT": "dwarf-with-dsym",
    "ENABLE_NS_ASSERTIONS": "NO",
    "SWIFT_COMPILATION_MODE": "wholemodule",
    "VALIDATE_PRODUCT": "YES",
}


def config_list(key, base, per):
    configs = [
        add(uid("config", key, name), "XCBuildConfiguration", buildSettings={**base, **extra}, name=name)
        for name, extra in per
    ]
    return add(uid("configlist", key), "XCConfigurationList", buildConfigurations=configs,
               defaultConfigurationIsVisible="0", defaultConfigurationName="Release")


# ---------- targets ----------
def phase(key, isa, refs, **extra):
    build_files = []
    for ref in refs:
        build_files.append(add(uid("build", key, isa, ref), "PBXBuildFile", fileRef=ref, **extra.pop("_file", {})))
    return add(uid("phase", key, isa), isa, buildActionMask="2147483647", files=build_files,
               runOnlyForDeploymentPostprocessing="0", **extra)


for key, t in TARGETS.items():
    t["phases"] = [
        phase(key, "PBXSourcesBuildPhase", [file_ref(p) for p in t["sources"]]),
        phase(key, "PBXFrameworksBuildPhase", []),
        phase(key, "PBXResourcesBuildPhase", [file_ref(p) for p in t["resources"]]),
    ]

PROJECT = uid("project")
watch_proxy = add(uid("proxy", "watch"), "PBXContainerItemProxy", containerPortal=PROJECT, proxyType="1",
                  remoteGlobalIDString=uid("target", "watch"), remoteInfo=TARGETS["watch"]["name"])
watch_dependency = add(uid("dependency", "watch"), "PBXTargetDependency", target=uid("target", "watch"), targetProxy=watch_proxy)
embed_file = add(uid("embed", "watch"), "PBXBuildFile", fileRef=TARGETS["watch"]["product_ref"],
                 settings={"ATTRIBUTES": ["RemoveHeadersOnCopy"]})
embed = add(uid("phase", "ios", "embed-watch"), "PBXCopyFilesBuildPhase", buildActionMask="2147483647",
            dstPath="$(CONTENTS_FOLDER_PATH)/Watch", dstSubfolderSpec="16", files=[embed_file],
            name="Embed Watch Content", runOnlyForDeploymentPostprocessing="0")
TARGETS["ios"]["phases"].append(embed)

for key, t in TARGETS.items():
    add(uid("target", key), "PBXNativeTarget",
        buildConfigurationList=config_list(key, t["settings"], [("Debug", {}), ("Release", {})]),
        buildPhases=t["phases"],
        buildRules=[],
        dependencies=[watch_dependency] if key == "ios" else [],
        name=t["name"],
        productName=t["name"],
        productReference=t["product_ref"],
        productType="com.apple.product-type.application")

add(PROJECT, "PBXProject",
    attributes={
        "BuildIndependentTargetsInParallel": "1",
        "LastSwiftUpdateCheck": "1540",
        "LastUpgradeCheck": "1540",
        "TargetAttributes": {uid("target", k): {"CreatedOnToolsVersion": "15.4"} for k in TARGETS},
    },
    buildConfigurationList=config_list("project", COMMON, [("Debug", DEBUG), ("Release", RELEASE)]),
    compatibilityVersion="Xcode 14.0",
    developmentRegion="en",
    hasScannedForEncodings="0",
    knownRegions=["en", "Base"],
    mainGroup=MAIN,
    productRefGroup=PRODUCTS,
    projectDirPath="",
    projectRoot="",
    targets=[uid("target", "ios"), uid("target", "watch")])


# ---------- write ----------
def render(value, indent):
    pad = "\t" * indent
    if isinstance(value, dict):
        inner = "".join(f"{pad}\t{q(k)} = {render(v, indent + 1)};\n" for k, v in value.items())
        return "{\n" + inner + pad + "}"
    if isinstance(value, list):
        inner = "".join(f"{pad}\t{render(v, indent + 1)},\n" for v in value)
        return "(\n" + inner + pad + ")"
    return q(value)


out = ["// !$*UTF8*$!\n{\n\tarchiveVersion = 1;\n\tclasses = {\n\t};\n\tobjectVersion = 56;\n\tobjects = {\n"]
for isa in sorted({isa for isa, _ in objects.values()}):
    out.append(f"\n/* Begin {isa} section */\n")
    for oid in sorted(o for o, (i, _) in objects.items() if i == isa):
        fields = {"isa": isa, **objects[oid][1]}
        out.append(f"\t\t{oid} = {render(fields, 2)};\n")
    out.append(f"/* End {isa} section */\n")
out.append(f"\t}};\n\trootObject = {PROJECT};\n}}\n")

dest = os.path.join(ROOT, "SITE14.xcodeproj")
os.makedirs(dest, exist_ok=True)
with open(os.path.join(dest, "project.pbxproj"), "w") as f:
    f.write("".join(out))

# A shared scheme, so command-line archives and every checkout see the same one.
SCHEME = """<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion = "1540" version = "1.7">
   <BuildAction parallelizeBuildables = "YES" buildImplicitDependencies = "YES">
      <BuildActionEntries>
         <BuildActionEntry buildForTesting = "YES" buildForRunning = "YES" buildForProfiling = "YES" buildForArchiving = "YES" buildForAnalyzing = "YES">
            {ref}
         </BuildActionEntry>
      </BuildActionEntries>
   </BuildAction>
   <TestAction buildConfiguration = "Debug" selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB" shouldUseLaunchSchemeArgsEnv = "YES">
   </TestAction>
   <LaunchAction buildConfiguration = "Debug" selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB" launchStyle = "0" useCustomWorkingDirectory = "NO" ignoresPersistentStateOnLaunch = "NO" debugDocumentVersioning = "YES" debugServiceExtension = "internal" allowLocationSimulation = "YES">
      <BuildableProductRunnable runnableDebuggingMode = "0">
         {ref}
      </BuildableProductRunnable>
   </LaunchAction>
   <ProfileAction buildConfiguration = "Release" shouldUseLaunchSchemeArgsEnv = "YES" savedToolIdentifier = "" useCustomWorkingDirectory = "NO" debugDocumentVersioning = "YES">
   </ProfileAction>
   <AnalyzeAction buildConfiguration = "Debug">
   </AnalyzeAction>
   <ArchiveAction buildConfiguration = "Release" revealArchiveInOrganizer = "YES">
   </ArchiveAction>
</Scheme>
"""
schemes = os.path.join(dest, "xcshareddata", "xcschemes")
os.makedirs(schemes, exist_ok=True)
for key, t in TARGETS.items():
    ref = (f'<BuildableReference BuildableIdentifier = "primary" BlueprintIdentifier = "{uid("target", key)}" '
           f'BuildableName = "{t["product"]}" BlueprintName = "{t["name"]}" ReferencedContainer = "container:SITE14.xcodeproj">\n'
           '            </BuildableReference>')
    with open(os.path.join(schemes, f'{t["name"]}.xcscheme'), "w") as f:
        f.write(SCHEME.replace("{ref}", ref))

print(f"Wrote {os.path.relpath(dest)} with {len(objects)} objects and {len(TARGETS)} shared schemes")
