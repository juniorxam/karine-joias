"""Build a CEP reference map from the IBGE CNEFE 2022 Palmas municipal ZIP.

Usage: python scripts/generate-palmas-ceps.py path/to/1721000_PALMAS.zip
"""
import csv
from collections import defaultdict
from io import TextIOWrapper
from math import asin, cos, radians, sin, sqrt
from pathlib import Path
from statistics import median
import sys
from zipfile import ZipFile

OUTPUT = Path(__file__).resolve().parents[1] / "supabase/functions/calculate-shipping/palmas-ceps.ts"
SOURCE = ("https://ftp.ibge.gov.br/Cadastro_Nacional_de_Enderecos_para_Fins_Estatisticos/"
          "Censo_Demografico_2022/Arquivos_CNEFE/CSV/Municipio/17_TO/1721000_PALMAS.zip")


def distance_m(a, b):
    lon1, lat1 = map(radians, a)
    lon2, lat2 = map(radians, b)
    term = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ** 2
    return 12_742_000 * asin(min(1, sqrt(term)))


def parse(path):
    points = defaultdict(set)
    with ZipFile(path) as archive:
        member, = (name for name in archive.namelist() if name.lower().endswith(".csv"))
        with archive.open(member) as file:
            rows = csv.DictReader(TextIOWrapper(file, encoding="utf-8-sig"), delimiter=";")
            for row in rows:
                cep = row["CEP"].strip()
                if row["COD_MUNICIPIO"] != "1721000" or len(cep) != 8 or not cep.isascii() or not cep.isdigit():
                    continue
                points[cep]
                try:
                    lon = float(row["LONGITUDE"].replace(",", "."))
                    lat = float(row["LATITUDE"].replace(",", "."))
                except ValueError:
                    continue
                if -49 < lon < -47 and -11.5 < lat < -9.5:
                    points[cep].add((lon, lat))
    return points


def main(path):
    entries = parse(path)
    if not entries:
        raise ValueError("The archive contains no Palmas postal codes.")
    lines = [f"// Generated from IBGE CNEFE 2022 (Palmas, TO). Source: {SOURCE}",
             "// [longitude, latitude, maximum distance in meters, distinct coordinate count]",
             "export const palmasCeps: Record<string, readonly [number, number, number, number] | null> = {"]
    compact = 0
    for cep, points in sorted(entries.items()):
        if not points:
            lines.append(f'  "{cep}": null,')
            continue
        center = (median(lon for lon, _ in points), median(lat for _, lat in points))
        center = tuple(round(value, 5) for value in center)
        radius = int(max(distance_m(center, point) for point in points)) + 1
        if len(points) >= 2 and radius <= 150:
            compact += 1
        lines.append(f'  "{cep}": [{center[0]}, {center[1]}, {radius}, {len(points)}],')
    OUTPUT.write_text("\n".join([*lines, "};", ""]), encoding="utf-8", newline="\n")
    print(f"{len(entries)} CEPs; {sum(bool(points) for points in entries.values())} com coordenadas; {compact} com referência compacta.")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
