#!/usr/bin/env python3
"""Local state for WeChat confirmations: pending items, processed Gmail ids, last run.

Usage:
  python3 wechat_state.py init                      # create files, print the state dir
  python3 wechat_state.py recipients                # print recipients.json
  python3 wechat_state.py unseen ID [ID ...]        # print the ids not processed yet
  python3 wechat_state.py seen ID [ID ...]          # mark Gmail message ids processed
  python3 wechat_state.py last-run [--set]          # print (or set to now) the last loop run, epoch seconds
  python3 wechat_state.py add '<json list>'         # add or update items, see below
  python3 wechat_state.py list [STATUS]             # items, optionally only one status
  python3 wechat_state.py set ID STATUS [--by NAME] [--value '<json>']
  python3 wechat_state.py sent ID [ID ...] [--reminder]
  python3 wechat_state.py due                       # pending items last sent 24h+ ago

add: each item is {"mawb", "content", "row", "fields"}; "row" = the 7 must-have values with
Claude's proposal, "fields" = the uncertain field names. An open item (pending/confirmed) for the
same MAWB is updated in place (status stays, "updated": true) instead of getting a new id.

Statuses: pending -> confirmed | corrected | rejected -> done. Files live in stateDir from
config.json (default ~/wechat-reminder). Writes are atomic.
"""
import json
import os
import sys
import tempfile
import time
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
OPEN = {'pending', 'confirmed', 'corrected'}
REMIND_AFTER = 24 * 3600
KEEP_SEEN = 5000


def state_dir():
    with open(os.path.join(HERE, '..', 'config.json'), encoding='utf-8') as f:
        cfg = json.load(f)
    return os.path.expanduser(cfg.get('stateDir', '~/wechat-reminder'))


def path(name):
    return os.path.join(state_dir(), name)


def load(name, default):
    try:
        with open(path(name), encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        return default


def save(name, data):
    d = state_dir()
    os.makedirs(d, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=d, suffix='.tmp')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path(name))


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def out(data):
    print(json.dumps(data, ensure_ascii=False, indent=1))


def items():
    return load('pending.json', {'next_id': 1, 'items': []})


def find(state, item_id):
    for it in state['items']:
        if it['id'] == item_id:
            return it
    sys.exit('no item %s' % item_id)


def main(argv):
    if not argv:
        sys.exit(__doc__)
    cmd, args = argv[0], argv[1:]

    if cmd == 'init':
        for name, default in [('pending.json', {'next_id': 1, 'items': []}),
                              ('seen.json', {'ids': []}),
                              ('recipients.json', [])]:
            if not os.path.exists(path(name)):
                save(name, default)
        out({'stateDir': state_dir()})

    elif cmd == 'recipients':
        out(load('recipients.json', []))

    elif cmd == 'unseen':
        seen = set(load('seen.json', {'ids': []})['ids'])
        out([i for i in args if i not in seen])

    elif cmd == 'seen':
        data = load('seen.json', {'ids': []})
        known = set(data['ids'])
        data['ids'] += [i for i in args if i not in known]
        data['ids'] = data['ids'][-KEEP_SEEN:]
        save('seen.json', data)
        out({'ok': True, 'count': len(data['ids'])})

    elif cmd == 'last-run':
        data = load('seen.json', {'ids': []})
        if '--set' in args:
            data['last_run'] = int(time.time())
            save('seen.json', data)
        out({'last_run': data.get('last_run')})

    elif cmd == 'add':
        state = items()
        result = []
        for new in json.loads(args[0]):
            old = next((it for it in state['items']
                        if it['mawb'] == new['mawb'] and it['status'] in OPEN), None)
            if old:
                changed = (old['content'], old.get('row')) != (new['content'], new.get('row'))
                if changed:
                    old.update(content=new['content'], row=new.get('row'),
                               fields=new.get('fields', []), updated=True, updated_at=now_iso())
                result.append({'id': old['id'], 'mawb': old['mawb'],
                               'result': 'updated' if changed else 'unchanged'})
                continue
            it = {'id': state['next_id'], 'mawb': new['mawb'], 'content': new['content'],
                  'row': new.get('row'), 'fields': new.get('fields', []),
                  'sent_to': [], 'status': 'pending', 'confirmed_by': None, 'value': None,
                  'created_at': now_iso(), 'last_sent': None, 'updated': False}
            state['next_id'] += 1
            state['items'].append(it)
            result.append({'id': it['id'], 'mawb': it['mawb'], 'result': 'new'})
        save('pending.json', state)
        out(result)

    elif cmd == 'list':
        state = items()
        out([it for it in state['items'] if not args or it['status'] == args[0]])

    elif cmd == 'set':
        state = items()
        it = find(state, int(args[0]))
        it['status'] = args[1]
        if '--by' in args:
            it['confirmed_by'] = args[args.index('--by') + 1]
        if '--value' in args:
            it['value'] = json.loads(args[args.index('--value') + 1])
        it['%s_at' % args[1]] = now_iso()
        save('pending.json', state)
        out(it)

    elif cmd == 'sent':
        state = items()
        recipients = [r['name'] for r in load('recipients.json', [])]
        for a in args:
            if a.startswith('--'):
                continue
            it = find(state, int(a))
            it['last_sent'] = int(time.time())
            it['sent_to'] = recipients
            it['updated'] = False
            if '--reminder' in args:
                it['reminders'] = it.get('reminders', 0) + 1
        save('pending.json', state)
        out({'ok': True})

    elif cmd == 'due':
        cutoff = time.time() - REMIND_AFTER
        out([it for it in items()['items']
             if it['status'] == 'pending' and it['last_sent'] and it['last_sent'] < cutoff])

    else:
        sys.exit(__doc__)


if __name__ == '__main__':
    main(sys.argv[1:])
