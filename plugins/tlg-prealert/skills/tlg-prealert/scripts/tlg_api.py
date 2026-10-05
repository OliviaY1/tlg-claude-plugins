#!/usr/bin/env python3
"""Call the TLG Sheet API or Attachment API (Apps Script web apps).

Usage:
  python3 tlg_api.py sheet KEYFILE ACTION ['{"tab": "...", ...}'] [--read-only]
  python3 tlg_api.py attachments KEYFILE ACTION ['{"messageId": "..."}'] [--read-only]

KEYFILE is the key file's JSON ({"url": ".../exec", "key": "..."}) saved locally.
Prints the API's JSON response. Never prints the key.
Delete actions are refused. --read-only also refuses every write.
"""
import json
import sys
import urllib.error
import urllib.parse
import urllib.request

READ = {
    'sheet': {'listTabs', 'getHeaders', 'readRows', 'lookup'},
    'attachments': {'listAttachments'},
}
WRITE = {
    'sheet': {'appendRows'},
    'attachments': {'saveAttachments'},
}


def fail(msg):
    print(json.dumps({'ok': False, 'error': msg}, ensure_ascii=False))
    sys.exit(1)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def post(url, data):
    """POST, then follow Apps Script's 302 with a plain GET (the result lives at the Location)."""
    opener = urllib.request.build_opener(NoRedirect)
    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
    for _ in range(5):
        try:
            with opener.open(req, timeout=120) as r:
                return r.read().decode('utf-8')
        except urllib.error.HTTPError as e:
            if e.code not in (301, 302, 303) or not e.headers.get('Location'):
                raise
            req = urllib.request.Request(urllib.parse.urljoin(req.full_url, e.headers['Location']))
    raise RuntimeError('too many redirects')


def main():
    args = [a for a in sys.argv[1:] if a != '--read-only']
    read_only = '--read-only' in sys.argv
    if len(args) < 3 or args[0] not in READ:
        fail(__doc__.strip())
    api, keyfile, action = args[0], args[1], args[2]
    params = json.loads(args[3]) if len(args) > 3 else {}

    allowed = READ[api] | (set() if read_only else WRITE[api])
    if action not in allowed:
        fail('Action "%s" is not allowed here. Allowed: %s' % (action, ', '.join(sorted(allowed))))

    with open(keyfile, encoding='utf-8-sig') as f:
        cred = json.load(f)
    body = dict(params, key=cred['key'], action=action)

    try:
        text = post(cred['url'], json.dumps(body).encode('utf-8'))
    except Exception as e:
        fail('Request failed: %s. If this is a network/egress error, add script.google.com and '
             'script.googleusercontent.com to the allowed domains.' % e)
    try:
        print(json.dumps(json.loads(text), ensure_ascii=False, indent=1))
    except ValueError:
        fail('Response was not JSON (wrong /exec link, or the deployment is not "Anyone"): ' + text[:300])


if __name__ == '__main__':
    main()
