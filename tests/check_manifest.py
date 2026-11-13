import json, os
d = "/home/zealish/Tools/MAPS_REVIEWS_EXPORTER"
m = json.load(open(os.path.join(d, "manifest.json")))
errs = []
for k in ["manifest_version", "name", "version"]:
    if k not in m:
        errs.append("missing " + k)
if m.get("manifest_version") != 3:
    errs.append("manifest_version must be 3")
popup = m.get("action", {}).get("default_popup")
if popup and not os.path.exists(os.path.join(d, popup)):
    errs.append("popup file missing: " + str(popup))
for size, path in m.get("icons", {}).items():
    if not os.path.exists(os.path.join(d, path)):
        errs.append("icon missing: " + path)
bg = m.get("background", {}).get("service_worker")
if bg and not os.path.exists(os.path.join(d, bg)):
    errs.append("bg missing: " + str(bg))
if "content_security_policy" in m:
    csp = m["content_security_policy"].get("extension_pages", "")
    if "http" in csp:
        errs.append("CSP allows remote")
print("MANIFEST ERRORS:", errs if errs else "NONE")
print("permissions:", m.get("permissions"))
print("host_permissions:", m.get("host_permissions"))
print("name:", m.get("name"))
print("version:", m.get("version"))
