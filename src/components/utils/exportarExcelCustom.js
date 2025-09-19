// ───────────────── utils/exportarExcelCustom.js ─────────────────
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

/**
 * Genera y descarga un XLSX con las filas visibles del DataGrid.
 *
 * @param {Array<Object>} rows    Filas ya filtradas/ordenadas (sin headers-año).
 * @param {Array<Object>} columns Columnas { field, headerName, … } del DataGrid.
 */
export async function exportarExcelCustom(rows = [], columns = []) {
    /* 1 ▸ Validaciones rápidas ------------------------------------------------ */
    if (!rows.length) {
        console.warn('[exportarExcelCustom] rows vacío: no hay nada que exportar.');
        return;
    }
    if (!columns.length) {
        columns = Object.keys(rows[0]).map(k => ({ field: k, headerName: k }));
    }

    /* 2 ▸ Libro y hoja -------------------------------------------------------- */
    const wb = new ExcelJS.Workbook();
    wb.creator = 'DataPPU Frontend';
    const ws = wb.addWorksheet('Listado');

    /* 3 ▸ Título centrado ----------------------------------------------------- */
    const lastCol = String.fromCharCode(65 + columns.length - 1); // A…Z, AA…
    ws.mergeCells(`A1:${lastCol}1`);
    ws.getCell('A1').value = 'Reporte de procesos – selección actual';
    ws.getCell('A1').font = { size: 16, bold: true };
    ws.getRow(1).height = 22;
    ws.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' };

    /* 4 ▸ Encabezados --------------------------------------------------------- */
    const headerRow = ws.addRow(columns.map(c => c.headerName || c.field));
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.eachCell(c => {
        c.border = {
            top: { style: 'thin' },
            bottom: { style: 'thin' },
            left: { style: 'thin' },
            right: { style: 'thin' },
        };
        c.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFDDEEFF' }, // azul muy clarito
        };
    });

    /* 5 ▸ Datos + formato condicional ---------------------------------------- */
    const bannedKW = ['ACUM', 'ACUMULADO', 'SUSPENDIDO', 'ANULADO', 'DERIVADO'];
    const seenPPU = new Set(); // para detectar duplicados

    rows.forEach(r => {
        const excelRow = ws.addRow(columns.map(c => r[c.field]));

        // centrado por defecto
        excelRow.alignment = { vertical: 'middle', horizontal: 'center' };

        // formatear campos fecha (heurística: el field contiene “fecha”)
        columns.forEach((col, i) => {
            if (/fecha/i.test(col.field) && r[col.field]) {
                excelRow.getCell(i + 1).numFmt = 'dd/mm/yyyy hh:mm';
            }
        });

        /* ---- coloreado avanzado (igual backend) ---- */
        const abogado = (r.abogado || '').toUpperCase();
        const registroPPU = (r.registro_ppu || '').toUpperCase();

        let fill = null;

        // 5-A) Prohibidas ⇒ rojo claro
        if (bannedKW.some(kw => abogado.includes(kw))) {
            fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };
        }
        // 5-B) Duplicados de PPU ⇒ amarillo
        else if (seenPPU.has(registroPPU)) {
            fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF99' } };
        }

        if (fill) excelRow.eachCell(c => { c.fill = fill; });

        seenPPU.add(registroPPU);
    });

    /* 6 ▸ Ancho fijo 12 + centrado (tal cual backend) ------------------------ */
    ws.columns.forEach(col => {
        col.width = 12;                                       // ancho fijo
        col.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    /* 7 ▸ Convertimos el rango de datos a tabla de Excel --------------------- */
    const nRows = ws.rowCount;
    ws.addTable({
        name: 'ListadoProcesos',
        ref: 'A2',
        headerRow: true,
        totalsRow: false,
        style: { theme: 'TableStyleMedium9', showRowStripes: true },
        columns: columns.map(c => ({ name: c.headerName || c.field })),
        rows: ws.getRows(3, nRows - 2).map(r => r.values.slice(1)), // sólo valores
    });

    /* 8 ▸ Guardar / descargar ------------------------------------------------- */
    const buf = await wb.xlsx.writeBuffer();
    const fileName = `Procesos_${new Date().toISOString().slice(0, 10)}.xlsx`;
    saveAs(
        new Blob([buf], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
        fileName,
    );
}
