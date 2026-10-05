// JXA uses system AppKit APIs; one process serves the watcher's JSON-lines requests.
ObjC.import("AppKit");
ObjC.import("Foundation");
var input = $.NSFileHandle.fileHandleWithStandardInput;
var output = $.NSFileHandle.fileHandleWithStandardOutput;
var clipboard = $.NSPasteboard.generalPasteboard;
var bytes = $.NSMutableData.alloc.init;
var buffer = "";
function reply(value) {
  output.writeData($(JSON.stringify(value) + "\n").dataUsingEncoding($.NSUTF8StringEncoding));
}
function text() {
  return ObjC.unwrap(clipboard.stringForType($.NSPasteboardTypeString)) || "";
}
while (true) {
  var data = input.availableData;
  if (!data.length) break;
  // availableData may split a UTF-8 character in a long JSON request.
  bytes.appendData(data);
  var decoded = ObjC.unwrap($.NSString.alloc.initWithDataEncoding(bytes, $.NSUTF8StringEncoding));
  if (typeof decoded !== "string") continue;
  bytes.setLength(0);
  buffer += decoded;
  var end;
  while ((end = buffer.indexOf("\n")) >= 0) {
    var line = buffer.slice(0, end);
    buffer = buffer.slice(end + 1);
    try {
      var request = JSON.parse(line);
      var result;
      if (request.action === "read") result = text();
      else if (request.action === "write") {
        clipboard.clearContents;
        if (request.text && !clipboard.setStringForType($(request.text), $.NSPasteboardTypeString)) throw new Error("Could not copy to clipboard");
        result = String(clipboard.changeCount);
      } else if (request.action === "sample") {
        var front = "";
        try { front = ObjC.unwrap($.NSWorkspace.sharedWorkspace.frontmostApplication.localizedName) || ""; } catch (_) {}
        // Never pair text from one copy with the revision of another copy.
        var stable = false;
        for (var attempt = 0; attempt < 3; attempt++) {
          var revision = String(clipboard.changeCount);
          var selection = text();
          if (revision === String(clipboard.changeCount)) { stable = true; break; }
        }
        if (!stable) throw new Error("Clipboard changed during sampling");
        result = { front: front, text: selection, revision: revision };
      } else throw new Error("Unknown clipboard operation");
      reply({ result: result });
    } catch (error) { reply({ error: String(error.message || error) }); }
  }
}
