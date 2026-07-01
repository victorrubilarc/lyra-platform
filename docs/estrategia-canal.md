# Estrategia de canal — Lyra WatchLog

> **Documento INTERNO y CONFIDENCIAL (ITESICWS).** No mostrar al socio de canal ni al
> cliente final. Contiene el precio mayorista, tu piso de rentabilidad, tu proyección de
> ingresos y los blindajes de contrato. La sección **§3 "Lámina para el socio"** es la
> ÚNICA parte pensada para presentarle a él (copiar/pegar a una slide o correo).
>
> Última actualización: **2026-07-01**. Estado: **propuesta** (pendiente de acuerdo con el socio).

---

## 1. Modelo de negocio

**Mayorista con licencias anuales renovables + marca blanca.** El socio compra bandas de
licencias a precio mayorista, las revende a sus propios clientes con su marca, y hace sus
propias implementaciones. ITESICWS entrega el producto (motor), las actualizaciones y el
soporte técnico de fondo.

| Función | Socio de canal | ITESICWS (tú) |
|---|---|---|
| Relación comercial con el cliente final | ✅ | — |
| Marca de cara al cliente | ✅ (marca blanca) | — |
| Implementación / configuración | ✅ (la factura él) | Soporte de implementación |
| Soporte nivel 1 (usuario final) | ✅ | — |
| Soporte nivel 2/3 (técnico/producto) | — | ✅ |
| Producto, actualizaciones, parches de seguridad, roadmap | — | ✅ |
| Emisión de licencias (llaves firmadas) | — | ✅ |
| Hosting on-premise | Lo opera el cliente/socio | — |

**Principio de renta:** todo es **anual renovable**. Nada perpetuo. La renovación (que incluye
updates + soporte L2/L3) es tu ingreso recurrente y tu ancla frente a la desintermediación.

---

## 2. Precio mayorista — versión INTERNA (con piso y tu economía)

Referencia de precio al cliente final (lo que el socio cobra): **CLP 18M – 24M/año por
instalación** (una instalación = una planta/faena/stack).

> **⚠️ Precio POR TRAMOS (graduated), NO por banda completa.** El precio se cobra por el **tramo
> donde cae cada licencia** y los tramos **se suman** (como los tramos de impuesto). Esto evita el
> **"acantilado" del descuento por volumen**: si se cobrara la banda completa (todas las licencias a
> un solo precio), pasar de 9 a 10 licencias BAJARÍA el ingreso (9×8,9=80,1M vs 10×7,5=75M). Con
> tramos, cada licencia adicional **siempre suma** y el promedio igual baja con el volumen.

| Tramo | Precio mayorista por licencia EN ESE TRAMO (marginal) |
|---|---|
| Licencias 1 – 3 | CLP 10,5M c/u |
| Licencias 4 – 9 | CLP 8,9M c/u |
| Licencias 10 – 19 | CLP 7,5M c/u |
| Licencias 20 + | CLP 6,5M c/u |
| **Prepago del bloque completo** | **−10% adicional sobre el total** |

**Total siempre monotónico (nunca pierdes al vender una más):**

| Nº licencias | Total anual | Promedio/lic | La licencia extra suma |
|---|---|---|---|
| 3 | CLP 31,5M | 10,5M | — |
| 9 | CLP 84,9M | 9,43M | — |
| 10 | CLP 92,4M | 9,24M | +7,5M |
| 19 | CLP 159,9M | 8,42M | — |
| 20 | CLP 166,4M | 8,32M | +6,5M |

Tu **costo marginal por instalación** es bajo (soporte L2/L3 + updates prorrateados; el cliente
hostea). El grueso de cada peso es amortización del activo + margen.

> **🔒 PISO (no cruzar): CLP 6M / licencia / año neto.** Bajo eso apenas cubres soporte + updates
> + amortización justa. Si el socio pide más descuento, se lo das con **más volumen comprometido o
> prepago**, nunca bajando el unitario por debajo del piso.

**Tu costo de reposición del activo** (referencia para valorar): ~7.000 HH ≈ **CLP 210M–315M**.
Se amortiza entre instalaciones, no en un trato.

---

## 3. Lámina para el socio (ESTO SÍ se le presenta)

> Copiar/pegar a slide, correo o PDF. NO incluye tu piso ni tu economía interna.

### Programa de canal Lyra WatchLog — Marca blanca

**Modelo:** licencias anuales renovables. Tú las revendes con **tu marca**, haces las
implementaciones y te quedas con el margen + los servicios. Nosotros ponemos el producto, las
actualizaciones y el soporte técnico de fondo.

**Precio por tramos de volumen (por licencia/año).** Cada licencia se cobra al precio del tramo
donde cae y los tramos se suman (como los tramos de impuesto): mientras más licencias, más barato el
**promedio**, y cada licencia adicional siempre cuesta menos que la anterior.

| Tramo | Precio por licencia en ese tramo |
|---|---|
| Licencias 1 – 3 | CLP 10,5M c/u |
| Licencias 4 – 9 | CLP 8,9M c/u |
| Licencias 10 – 19 | CLP 7,5M c/u |
| Licencias 20 o más | CLP 6,5M c/u |
| **Prepago del bloque completo** | **10% de descuento sobre el total** |

Ejemplo: 10 licencias = CLP 92,4M/año (promedio CLP 9,24M c/u); la licencia número 20 cuesta solo
CLP 6,5M.

**Tu margen (ejemplo, cada licencia adicional en el tramo 10–19 te cuesta CLP 7,5M):**

| Concepto | Monto |
|---|---|
| Precio sugerido al cliente final (licencia/año) | CLP 18M – 24M |
| Implementación inicial (una vez, la facturas tú) | CLP 8M – 20M |
| Costo de esa licencia adicional (a ITESICWS) | − CLP 7,5M |
| **Tu margen año 1 por instalación** | **≈ CLP 18M – 32M** |
| Tu margen recurrente (año 2+) | ≈ CLP 10M – 16M / año |

**Incluye en la licencia anual:** todos los módulos del núcleo, actualizaciones, parches de
seguridad, soporte técnico L2/L3 y **marca blanca** (tu logo, tus colores, tu nombre de producto).

**Condiciones:**
- Renovación **anual**. Descuento por **banda de volumen** y por **prepago**.
- Mínimo de compromiso anual para acceder a las bandas altas.
- Territorio/rubro de exclusividad negociable con metas mínimas.

---

## 4. Condiciones comerciales

- **Renovación anual automática** salvo aviso previo (p. ej. 60 días).
- **Bandas por volumen:** el precio se recalcula según licencias activas al momento de renovar;
  crecer de banda es inmediato, bajar de banda aplica en la próxima renovación.
- **Prepago del bloque:** −10% por pagar la banda completa por adelantado (mejora tu caja).
- **Mínimo anual** para bandas de 10+ (que no acapare la exclusividad con cero ventas).
- **Exclusividad acotada** (por rubro o territorio) **con metas mínimas**: si no cumple, el canal
  se libera para otros socios.
- **Ajuste de precio** indexado (UF o % anual acordado) para no erosionar el valor con el tiempo.

---

## 5. Proyección de ingresos (ITESICWS) — escenario conservador

| Año | Instalaciones activas | Banda | Ingreso recurrente |
|---|---|---|---|
| 1 | 4 | 4–9 (@8,9M) | CLP ~36M |
| 2 | 10 | 10–19 (@7,5M) | CLP ~75M |
| 3 | 18 | 10–19 (@7,5M) | CLP ~135M |
| **Acumulado 3 años** | — | — | **CLP ~246M** |

A ~3 años recuperas el costo de construcción del activo (~CLP 250M); de ahí en adelante es casi
todo margen. **El negocio está en el volumen de instalaciones**, no en exprimir cada trato — eso es
lo que debe motivar al canal.

---

## 6. Blindajes de contrato (no negociables)

- **IP siempre de ITESICWS.** El código, la arquitectura, el know-how y la marca Lyra WatchLog son
  tuyos. Al socio se le otorga una **licencia de reventa/distribución** por término, revocable — no
  la propiedad. Prohibido acceder al fuente, modificar, descompilar o crear derivados. La marca
  blanca es visual (su marca en la capa de presentación); **no le transfiere derechos** sobre el
  producto subyacente. Toda mejora que desarrolles sigue siendo tuya. Al terminar la relación, su
  derecho a revender se extingue (con cláusula de transición para no dejar tirado al cliente final).
- **Control de actualizaciones y parches de seguridad = ITESICWS.** En industria regulada, esto no
  es opcional; es también tu palanca de dependencia sana.
- **Obligación de reporte de instalaciones** (que la llave de licencia hace cumplir sola).
- **Cláusula de transición** al terminar: continuidad del servicio a los clientes finales.
- **Prohibición de sublicenciar** fuera del alcance acordado.

---

## 7. Ítems a construir ANTES de firmar el canal

Dos desarrollos que este modelo vuelve obligatorios (detalle técnico en [`LICENSING.md`](./LICENSING.md)):

| Ítem | Qué es | Estimación |
|---|---|---|
| **Módulo de licenciamiento/activación** | Llave firmada offline: vencimiento, tope de instalaciones/nodos/usuarios, módulos habilitados. Hace cumplir el modelo sin confiar en la honestidad. | ~80–160 HH |
| **Modo marca blanca completo** | Nombre de producto configurable en toda la app, login personalizable, branding en el acta PDF y en los correos (hoy los temas son override parcial y el login queda con marca Lyra). | ~60–120 HH |

Total: ~140–280 HH (≈ CLP 5M–12M de costo de reposición). **Se pagan solos con la 1ª–2ª
instalación** y sin ellos el modelo es un colador. Hacerlos antes de cerrar el trato.

---

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| **Desintermediación** (él es dueño de la relación y la marca) | Renta recurrente + control de updates + IP tuya + no entregar fuente. Tú eres indispensable en el tiempo, no en el binario. |
| **Concentración en un solo canal** | Diseñar el programa como **replicable con varios socios** desde el día uno; exclusividad solo acotada y con metas. |
| **Sobre-despliegue / piratería** | Llave de licencia firmada (tope de instalaciones) + contrato + auditoría. |
| **Mala implementación bajo su marca daña el producto** | Certificación/capacitación del socio + soporte de implementación + plantillas de arranque. |
| **Erosión de precio en el tiempo** | Indexación (UF/%) en el contrato. |

---

## Próximos pasos
1. Validar el rango de precio final con el socio (él sabe qué tolera el cliente final).
2. Aprobar y construir los dos ítems del §7 (licenciamiento + marca blanca).
3. Redactar el contrato de canal con los blindajes del §6.
4. (Opcional) Registrar los dos ítems de desarrollo en `docs/BACKLOG.md §2` cuando se aprueben.
