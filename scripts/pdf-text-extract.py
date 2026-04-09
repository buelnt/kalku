#!/usr/bin/env python3
"""
Extrahiert Text aus einer PDF-Datei.
Wird als Subprocess von Electron aufgerufen.

Usage: python3 pdf-text-extract.py <pfad-zur-pdf>
Output: UTF-8 Text auf stdout
"""
import sys
try:
    import pdfplumber
except ImportError:
    print("FEHLER: pdfplumber nicht installiert. Bitte 'pip3 install pdfplumber' ausführen.", file=sys.stderr)
    sys.exit(1)

if len(sys.argv) < 2:
    print("Usage: python3 pdf-text-extract.py <pfad>", file=sys.stderr)
    sys.exit(1)

pfad = sys.argv[1]
try:
    with pdfplumber.open(pfad) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                print(text)
                print("---PAGE_BREAK---")
except Exception as e:
    print(f"FEHLER: {e}", file=sys.stderr)
    sys.exit(1)
