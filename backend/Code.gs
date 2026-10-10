function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, probe: 'get' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  return ContentService
    .createTextOutput(JSON.stringify({
      ok: true, probe: 'post',
      type: e.postData && e.postData.type,
      got: e.postData && e.postData.contents
    }))
    .setMimeType(ContentService.MimeType.JSON);
}
