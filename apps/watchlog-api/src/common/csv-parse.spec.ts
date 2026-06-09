import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv-parse";
import { toCsv } from "./csv";

describe("parseCsv (RFC 4180)", () => {
  it("parsea filas simples con coma y detecta el delimitador", () => {
    const r = parseCsv("code,label\nVIB,Vibración\nLEAK,Fuga");
    expect(r.delimiter).toBe(",");
    expect(r.rows).toEqual([
      ["code", "label"],
      ["VIB", "Vibración"],
      ["LEAK", "Fuga"],
    ]);
  });

  it("auto-detecta ';' (Excel es-CL) y tolera CRLF + BOM", () => {
    const r = parseCsv("﻿code;label\r\nVIB;Vibración excesiva\r\n");
    expect(r.delimiter).toBe(";");
    expect(r.rows).toEqual([
      ["code", "label"],
      ["VIB", "Vibración excesiva"],
    ]);
  });

  it("maneja celdas entrecomilladas con delimitador, comillas dobladas y saltos internos", () => {
    const r = parseCsv('code,label\nA,"Hola, mundo"\nB,"Dice ""hola"""\nC,"línea 1\nlínea 2"');
    expect(r.rows[1]).toEqual(["A", "Hola, mundo"]);
    expect(r.rows[2]).toEqual(["B", 'Dice "hola"']);
    expect(r.rows[3]).toEqual(["C", "línea 1\nlínea 2"]);
  });

  it("round-trip con nuestro toCsv en ';'", () => {
    const csv = toCsv(
      [{ code: "A;1", label: 'Con "comillas"' }],
      [
        { header: "code", value: (r) => r.code },
        { header: "label", value: (r) => r.label },
      ],
      ";",
    );
    const r = parseCsv(csv);
    expect(r.delimiter).toBe(";");
    expect(r.rows[1]).toEqual(["A;1", 'Con "comillas"']);
  });

  it("rechaza comillas sin cerrar", () => {
    expect(() => parseCsv('code,label\nA,"sin cierre')).toThrow(/comillas sin cerrar/);
  });

  it("contenido vacío devuelve cero filas", () => {
    expect(parseCsv("").rows).toEqual([]);
    expect(parseCsv("  \n").rows.length).toBeLessThanOrEqual(1);
  });
});
