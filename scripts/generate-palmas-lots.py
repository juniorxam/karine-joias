"""Generate the compact public IBGE address index for numbered lots in Palmas."""
from collections import defaultdict
import base64
import csv
import gzip
from io import TextIOWrapper
import json
from pathlib import Path
import re
from statistics import median
import sys
sys.dont_write_bytecode = True
from zipfile import ZipFile

from importlib.util import spec_from_file_location, module_from_spec

source = spec_from_file_location("cep_generator", Path(__file__).with_name("generate-palmas-ceps.py"))
cep_generator = module_from_spec(source)
source.loader.exec_module(cep_generator)

NUMBER = re.compile(r"(?:(?:LT|LOTE|N[.º°]?)\s*)?0*([1-9]\d*)\s*([A-Z]?)", re.ASCII)
OUTPUT = cep_generator.OUTPUT.with_name("palmas-lots.ts")

def normalize(value):
    result = NUMBER.fullmatch(value.strip().upper())
    return "".join(result.groups()).lower() if result else None

def generate(path):
    points = defaultdict(set)
    with ZipFile(path) as archive:
        member, = (name for name in archive.namelist() if name.lower().endswith(".csv"))
        with archive.open(member) as file:
            for row in csv.DictReader(TextIOWrapper(file, encoding="utf-8-sig"), delimiter=";"):
                cep = row["CEP"].strip()
                if row["COD_MUNICIPIO"] != "1721000" or row["NV_GEO_COORD"] != "1" or not re.fullmatch(r"[0-9]{8}", cep):
                    continue
                lots = {normalize(row[f"VAL_COMP_ELEM{i}"]) for i in range(1, 6)
                        if row[f"NOM_COMP_ELEM{i}"].strip().upper() in {"LOTE", "LT"}} - {None}
                if not lots:
                    number = normalize(row["NUM_ENDERECO"])
                    if number:
                        lots.add(number)
                try:
                    lon = float(row["LONGITUDE"].replace(",", "."))
                    lat = float(row["LATITUDE"].replace(",", "."))
                except ValueError:
                    continue
                if -49 < lon < -47 and -11.5 < lat < -9.5:
                    for lot in lots:
                        points[cep, lot].add((lon, lat))
    index = defaultdict(dict)
    ambiguous = 0
    for (cep, lot), coordinates in sorted(points.items()):
        center = (median(lon for lon, _ in coordinates), median(lat for _, lat in coordinates))
        # A lot number repeated in separate blocks must fall back to an address lookup.
        if any(cep_generator.distance_m(center, point) > 20 for point in coordinates):
            ambiguous += 1
            continue
        index[cep][lot] = [round(center[0]*100000), round(center[1]*100000)]
    packed = base64.b64encode(gzip.compress(json.dumps(index, separators=(",", ":")).encode(), mtime=0)).decode()
    lines = ["// Generated from IBGE CNEFE 2022 for Palmas (municipality 1721000).",
             "// gzip/base64 JSON of CEP → lot → [longitude, latitude] × 100000.",
             "export const palmasLotsGzip = ["]
    lines.extend(f'  "{packed[i:i+2000]}",' for i in range(0, len(packed), 2000))
    OUTPUT.write_text("\n".join([*lines, '].join("");', ""]), encoding="utf-8", newline="\n")
    print(sum(map(len,index.values())), "lot keys in",len(index),"CEPs;",ambiguous,"ambiguous;",len(packed),"compressed characters")

if __name__ == "__main__":
    generate(Path(sys.argv[1]))
