"""Download public upstream snapshots into a NEW directory. No live data is changed."""
import hashlib
import json
import pathlib
import shutil
import sys
import time
import urllib.request
import zipfile
from datetime import datetime, timezone

SOURCES = {
    'bus.json': 'https://static.data.gov.hk/td/routes-fares-geojson/JSON_BUS.json',
    'gmb.json': 'https://static.data.gov.hk/td/routes-fares-geojson/JSON_GMB.json',
    'gtfs.zip': 'https://static.data.gov.hk/td/pt-headway-tc/gtfs.zip',
    'geometry.zip': 'https://codeload.github.com/hkbus/route-waypoints/zip/refs/heads/gh-pages',
}

def extract(archive, target):
    target.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as z:
        if sum(i.file_size for i in z.infolist()) > 1_500_000_000:
            raise ValueError('Archive exceeds extraction limit')
        for info in z.infolist():
            rel = pathlib.PurePosixPath(info.filename)
            if rel.is_absolute() or '..' in rel.parts or '\\' in info.filename or ':' in info.filename:
                raise ValueError('Unsafe archive path')
            dest = target.joinpath(*rel.parts)
            if info.is_dir():
                dest.mkdir(parents=True, exist_ok=True)
            else:
                dest.parent.mkdir(parents=True, exist_ok=True)
                with z.open(info) as src, dest.open('wb') as dst:
                    shutil.copyfileobj(src, dst)

def main():
    if len(sys.argv) != 2:
        raise SystemExit('Usage: python scripts/download-data.py <new-raw-directory>')
    out = pathlib.Path(sys.argv[1]).resolve()
    out.mkdir(parents=True, exist_ok=False)
    manifest = {'downloaded': datetime.now(timezone.utc).isoformat(), 'sources': {}}
    for name, url in SOURCES.items():
        for attempt in range(3):
            try:
                req = urllib.request.Request(url, headers={'User-Agent': 'BusRoamHK-data-maintenance/1.0'})
                total = 0
                h = hashlib.sha256()
                with urllib.request.urlopen(req, timeout=120) as response, (out / name).open('wb') as file:
                    while chunk := response.read(1024 * 1024):
                        total += len(chunk)
                        if total > 200_000_000:
                            raise ValueError('Download exceeds size limit')
                        h.update(chunk)
                        file.write(chunk)
                    manifest['sources'][name] = {'url': url, 'bytes': total, 'sha256': h.hexdigest(), 'lastModified': response.headers.get('Last-Modified')}
                break
            except Exception:
                if attempt == 2:
                    raise
                time.sleep(2 ** attempt)
        print('Downloaded ' + name, flush=True)
    for name in ['bus.json', 'gmb.json']:
        data = json.loads((out / name).read_text(encoding='utf-8-sig'))
        if not data.get('features'):
            raise ValueError('Missing GeoJSON features: ' + name)
    extract(out / 'gtfs.zip', out / 'gtfs')
    extract(out / 'geometry.zip', out / 'geometry')
    required = ['gtfs/' + n + '.txt' for n in ['routes', 'stops', 'stop_times', 'trips', 'calendar', 'calendar_dates', 'frequencies']]
    required.append('geometry/route-waypoints-gh-pages/0versions.json')
    for name in required:
        if not (out / name).is_file():
            raise ValueError('Missing input: ' + name)
    (out / 'download-manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    print('Ready: ' + str(out))

if __name__ == '__main__':
    main()
