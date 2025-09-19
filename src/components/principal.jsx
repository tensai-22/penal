import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import BulkUpdateButton from './BOX-PLAZOS/BulkUpdateButton';

import { useDropzone } from 'react-dropzone';
import debounce from 'lodash.debounce';
import { parse, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Popper } from '@mui/material';
import LawyerFilter from './LawyerFilter';
import {
    Box, Button, Typography, Modal, TextField, Grid, Paper,
    TableContainer, Table, TableHead, TableRow, TableCell, TableBody,
    FormControl, InputLabel, Select, MenuItem, FormControlLabel,
    Checkbox, Autocomplete, Dialog,
    DialogTitle,
    DialogContent,
    DialogActions
} from '@mui/material';

import {
    DataGrid,
    GridToolbarContainer,
    GridToolbarColumnsButton,
    GridToolbarFilterButton,
    GridToolbarDensitySelector,
    GridToolbarExport,
    GridToolbarQuickFilter   // opcional (requiere @mui/x-data-grid v5.17+)
} from '@mui/x-data-grid';
import { exportarExcelCustom } from './utils/exportarExcelCustom';

import { FixedSizeList } from 'react-window';
import axios, { CancelToken } from 'axios';
import BusquedaRapida from './principal/common-principal/busqueda-rapida';

import { esES } from '@mui/x-data-grid/locales';
import DownloadIcon from '@mui/icons-material/Download';
import Ingresos from './principal/common-principal/ingresos';

// Constante de estilo para modales
const modalStyle = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: 500,
    backgroundColor: '#fff',
    border: '2px solid #000',
    boxShadow: 24,
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
};



const Principal = ({ isLoggedIn, role, username }) => {



    const [tab, setTab] = useState(0);

    // Estados para modo búsqueda y filtros
    const [searchMode, setSearchMode] = useState(false);
    const [queryNotificacion, setQueryNotificacion] = useState('');
    const [searchField, setSearchField] = useState('legajo');
    const [query, setQuery] = useState('');

    // Estados para modales y rangos
    const [openRangoModal, setOpenRangoModal] = useState(false);

    const [openModal, setOpenModal] = useState(false);

    // Estados para datos y paginación (tabla principal)
    // Estados para datos y paginación (tabla principal)
    const [totalRecords, setTotalRecords] = useState(0);
    const [totalPages, setTotalPages] = useState(1);

    // — Se agrega estado para los datos que llegan del API —
    const [datos, setDatos] = useState([]);     // <-- Añadido para almacenar resultados

    // Si luego sigues usando setPage(…) en tu código, también necesitas:
    const [page, setPage] = useState(1);        // <-- Añadido para controlar la página actual

    // *** NUEVOS ESTADOS PARA FILTROS ***
    const [filtroYear, setFiltroYear] = useState("");
    const [availableYears, setAvailableYears] = useState([]); // ← AÑADIDO
    const [filtroTipo, setFiltroTipo] = useState("ALL");


    const API_BASE_URL = `${window.location.protocol}//${window.location.hostname}:5001`;






    const handleAgregarCaso = async () => {
        await agregarCaso();          // reutiliza la lógica ya implementada
    };





    // Variables y funciones para elementos adicionales
    const [selectedAbogado, setSelectedAbogado] = useState("");
    // Estado para el modal de historial mínimo
    const [openHistorialMinimal, setOpenHistorialMinimal] = useState(false);
    // Estado para datos del historial mínimo
    const [historialData, setHistorialData] = useState([]);

    const [mostrarArchivados, setMostrarArchivados] = useState(false);
    // Función para resaltar coincidencias en la búsqueda
    const highlightMatch = (text, query) => {
        if (!text || !query) return text;
        const regex = new RegExp(`(${query})`, 'gi');
        return text.split(regex).map((part, index) =>
            part.toLowerCase() === query.toLowerCase() ? (
                <span key={index} style={{ backgroundColor: '#FFFF00' }}>{part}</span>
            ) : (
                part
            )
        );
    };



    const modalFieldLabels = {
        abogado: "Abogado",
        delito: "Delito",
        denunciado: "Denunciado",
        departamento: "Departamento",
        e_situacional: "Situación",
        etiqueta: "Etiqueta",
        fecha_de_archivo: "Fecha de Archivo",
        fecha_e_situacional: "Fecha de Estado",
        fecha_ingreso: "Fecha de Ingreso",
        fiscalia: "Fiscalía",
        informe_juridico: "Informe Jurídico",
        item: "Ítem",
        juzgado: "Juzgado",
        last_modified: "Última Modificación",
        "nr de exp completo": "Número de Expediente Completo",
        origen: "Origen",
        registro_ppu: "Registro PPU",
        source: "Fuente"
    };

    const formatModalDate = (dateStr) => {
        if (!dateStr) return "";
        const dateObj = new Date(dateStr);
        if (isNaN(dateObj.getTime())) {
            return dateStr;
        }
        return format(dateObj, "dd 'de' MMMM yyyy, HH:mm:ss", { locale: es });
    };

    // Estados para modal de impulso
    const [busquedaQuery, setBusquedaQuery] = useState('');
    const [busquedaTipo, setBusquedaTipo] = useState('casoJudicial');
    const [impulsoResults, setImpulsoResults] = useState([]);
    const [impulsoTempSeleccionado, setImpulsoTempSeleccionado] = useState(null);
    const [openImpulsoConfirmModal, setOpenImpulsoConfirmModal] = useState(false);
    const [openImpulsoUploadModal, setOpenImpulsoUploadModal] = useState(false);




    const debouncedImpulsoSearch = useMemo(
        () => debounce(async q => {
            if (!q.trim()) {
                setImpulsoResults([]);
                return;
            }
            try {
                const { data } = await axios.get(`${API_BASE_URL}/api/new_search`, {
                    params: { query: q, search_field: busquedaTipo }
                });
                setImpulsoResults(data);
            } catch {
                setImpulsoResults([]);
            }
        }, 500),
        [busquedaTipo]
    );

    const downloadPDF = async row => {
        const resp = await axios.get(
            `${API_BASE_URL}/api/descargar_pdf?ruta=${encodeURIComponent(row.ruta)}`,
            { responseType: 'blob' }
        );
        const blob = new Blob([resp.data], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(blob);
        const fecha = format(new Date(row.fecha_atencion), 'dd-MM-yyyy', { locale: es });
        const name = `${row.abogado}_${row.registro_ppu}_${row.origen}_${fecha}.pdf`;
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
    };

    const handleImpulsoRowClick = row => {
        setImpulsoTempSeleccionado(row);
        setOpenImpulsoConfirmModal(true);
    };

    const handleConfirmImpulso = async () => {
        setOpenImpulsoConfirmModal(false);
        setOpenImpulsoModal(false);

        console.log('→ payload registro_ppu:', impulsoTempSeleccionado.registro_ppu);

        try {
            const response = await axios.post(
                `${API_BASE_URL}/api/historiales`,
                { registro_ppu: [impulsoTempSeleccionado.registro_ppu] }
            );

            // 1. Inspeccionar la estructura completa
            console.log('← response.data:', response.data);
            console.log('← response.data.historiales:', response.data.historiales);
            console.log('← Claves en historiales:', Object.keys(response.data.historiales));

            // 2. Extraer solo el array que corresponde al PPU
            const registrosPorPPU = response.data.historiales[
                impulsoTempSeleccionado.registro_ppu
            ] || [];

            console.log('→ registrosPorPPU:', registrosPorPPU);

            // 3. Actualizar estado y abrir modal
            setHistorialData(registrosPorPPU);
            setSelectedRegistroPPU(impulsoTempSeleccionado.registro_ppu);
            setOpenHistorialMinimal(true);
        } catch (error) {
            console.error('Error en axios.post /api/historiales:', error.response ?? error);
            alert("Error al obtener historial");
        }
    };




    const handleCancelImpulso = () => {
        setImpulsoTempSeleccionado(null);
        setOpenImpulsoConfirmModal(false);
    };







    // Función para ejecutar búsqueda condicional
    const pdfWindowRef = useRef(null);
    // Después:
    const buscarDatos = useCallback(async (_paginaIgnorada, queryTerm) => {
        if (cancelTokenSource) {
            cancelTokenSource.cancel("Cancelando solicitud previa");
        }
        cancelTokenSource = CancelToken.source();

        try {
            console.log("Frontend:/api/buscar con params →", {
                query: queryTerm,
                abogado: procesarAbogado(selectedAbogado),
                mostrar_archivados: mostrarArchivados,
                year: filtroYear,
                tipo: filtroTipo,
            });

            const response = await axios.get(`${API_BASE_URL}/api/buscar`, {
                params: {
                    limit: 1000000,
                    query: queryTerm,
                    abogado: procesarAbogado(selectedAbogado),
                    mostrar_archivados: mostrarArchivados,
                    year: filtroYear,
                    tipo: filtroTipo,
                },
                cancelToken: cancelTokenSource.token,
            });

            console.log("Frontend:/api/buscar respondió →", response.data);
            setDatos(response.data.data);
            setTotalRecords(response.data.total_records);
        } catch (error) {
            if (axios.isCancel(error)) {
                console.log("Solicitud cancelada:", error.message);
            } else {
                console.error("Error en /api/buscar:", error);
            }
        }
    }, [API_BASE_URL, selectedAbogado, mostrarArchivados, filtroYear, filtroTipo]);





    const debouncedBuscarDatos = useCallback(
        debounce((pagina, queryTerm) => {
            buscarDatos(pagina, queryTerm);
        }, 500),
        [buscarDatos]
    );


    const [openBusquedaRapida, setOpenBusquedaRapida] = useState(false);


    // —————— A) useEffect para cargar “availableYears” ——————
    useEffect(() => {
        if (!isLoggedIn) return;

        axios
            .get(`${API_BASE_URL}/api/years`)
            .then(respYears => {
                // 1) Obtener arreglo crudo (por ejemplo: [2025, "2024", 2023, 0])
                const raw = respYears.data.years || [];

                // 2) Convertir todo a string y quedarnos solo con cadenas de 4 dígitos
                const years = raw
                    .map(y => String(y))
                    .filter(y => /^\d{4}$/.test(y));  // acepta "2025", "2024", etc.

                setAvailableYears(years);

                // 3) Si aún no teníamos filtro, presetear al primero (el más alto)
                if (!filtroYear && years.length > 0) {
                    setFiltroYear(years[0]);
                }
            })
            .catch(err => {
                console.error("Error cargando availableYears:", err);
            });
    }, [isLoggedIn]);







    // —————— B) useEffect para averiguar “used_year” inicial ——————
    useEffect(() => {
        if (!isLoggedIn) return;

        const source = CancelToken.source();
        axios
            .get(`${API_BASE_URL}/api/buscar`, {
                params: {
                    page: 1,
                    limit: 1,
                    query: "",
                    abogado: procesarAbogado(selectedAbogado),
                    // No enviamos ni mostrar_archivados ni tipo aquí,
                    // sólo queremos el used_year inicial
                },
                cancelToken: source.token,
            })
            .then(resp => {
                const usedString = String(resp.data.used_year || "");
                if (usedString && usedString !== "0") {
                    setFiltroYear(usedString);
                }
            })
            .catch(err => {
                if (!axios.isCancel(err)) {
                    console.error("Error obteniendo used_year:", err);
                }
            });

        return () => source.cancel("Limpiando petición inicial de used_year");
    }, [
        isLoggedIn]);



    // —————— C) useEffect que realmente dispara buscarDatos cuando filtroYear ya existe ——————
    useEffect(() => {
        if (!isLoggedIn) return;
        // Solo llamar a buscarDatos si filtroYear NO es cadena vacía
        if (filtroYear === "") {
            return;
        }
        // Ahora filtroYear ya vale “2025” (o equivalente), así que buscamos datos
        buscarDatos(1, query);
    }, [
        isLoggedIn,
        selectedAbogado,
        mostrarArchivados,
        filtroYear,     // cuando cambie, y no sea "", ejecutamos buscarDatos
        filtroTipo,
        query,
        buscarDatos
    ]);




    // Función auxiliar para generar 'nr de exp completo'
    const buildNrCompleto = (fiscaliaCode, casoCorto) => {
        const partes = casoCorto.split('-').map(p => p.trim());
        if (partes.length !== 2) return '';
        const [num, year] = partes;
        return `${fiscaliaCode}-${year}-${num}-0`;
    };





    // Manejo del cambio en el campo de búsqueda
    const handleQueryChange = (e) => {
        const newQuery = e.target.value;
        setQuery(newQuery);
        setPage(1);
        if (filtroYear !== "") {
            debouncedBuscarDatos(1, newQuery);
        }
    };


    const handleQueryNotificacionChange = (e) => {
        const newQuery = e.target.value;
        setQueryNotificacion(newQuery);
        setPage(1); // Reinicia la página a 1, si es necesario
        debouncedAdvancedData();
    };


    // Función para procesar búsqueda por rango
    const handleBuscarPorRango = () => {
        // Pasa todos los filtros actuales:
        buscarDatosPorRango(
            rangoPpuInicio,
            rangoPpuFin,
            selectedAbogado,   // <-- ¡Añadido!
            mostrarArchivados, // <-- ¡Añadido!
            query             // <-- ¡Añadido!
        );
    };


    const buscarDatosPorRango = async (ppuInicio, ppuFin, abogado, mostrarArch, myQuery) => {
        try {
            setIsRangeSearchActive(true);
            const response = await axios.get(`${API_BASE_URL}/api/buscar_rango`, {
                params: {
                    ppu_inicio: ppuInicio,
                    ppu_fin: ppuFin,
                    abogado: abogado,           // <-- ¡NUEVO!
                    mostrar_archivados: mostrarArch, // <-- ¡NUEVO!
                    query: myQuery,             // <-- ¡NUEVO!
                },
            });
            setDatos(response.data.data);
            setTotalRecords(response.data.data.length);
            setPage(1);
            setTotalPages(1);
        } catch (error) {
            console.error(error);
            alert("Error en búsqueda por rango");
        } finally {
            setOpenRangoModal(false);
        }
    };


    const [rangoPpuInicio, setRangoPpuInicio] = useState('');
    const [rangoPpuFin, setRangoPpuFin] = useState('');
    const [isRangeSearchActive, setIsRangeSearchActive] = useState(false);

    const timeInputRef = useRef(null);
    let cancelTokenSource; // Variable para manejar la cancelación de solicitudes.
    const procesarAbogado = (valor) => {
        if (!valor) return '';
        const partes = valor.split(';');
        return partes.length > 1 ? partes[1].trim() : valor.trim();
    };

    axios.defaults.withCredentials = true;
    const [editingSeguimientoIndex, setEditingSeguimientoIndex] = useState(null);
    const [editingSeguimientoValue, setEditingSeguimientoValue] = useState('');

    const CustomPopper = (props) => {
        return (
            <Popper
                {...props}
                style={{ zIndex: 2000, marginTop: '5px', ...props.style }}
                placement="bottom-start"
            />
        );
    };


    


    const exportarExcel = async () => {
        try {
            // 1) Construir params base
            const params = {
                query,
                abogado: selectedAbogado,
                mostrar_archivados: mostrarArchivados,
                year: filtroYear,
                tipo: filtroTipo,
            }

            // 2) Incluir rango si aplica
            if (isRangeSearchActive) {
                params.ppu_inicio = rangoPpuInicio
                params.ppu_fin = rangoPpuFin
            }

            // 3) Llamada al endpoint, esperando blob
            const response = await axios.get(
                `${API_BASE_URL}/api/exportar_excel`,
                {
                    params,
                    responseType: 'blob',
                    withCredentials: true,
                }
            )

            // 4) Extraer filename de headers o construir fallback dinámico
            const cd = response.headers['content-disposition'] || ''
            let fileName = ''
            const m = cd.match(/filename="?(.+?)"?($|;)/)
            if (m) {
                fileName = m[1]
            } else {
                // → Aquí viene el cambio clave:
                const displayName = selectedAbogado
                    ? selectedAbogado.toUpperCase()
                    : (role === 'admin'
                        ? 'GENERAL'
                        : username.toUpperCase()
                    )
                const fecha = format(new Date(), "dd-MM-yyyy HH'h'mm'm'", { locale: es })
                fileName = `Base de datos del año ${filtroYear || ''} - ${displayName} a la fecha de ${fecha}.xlsx`
            }

            // 5) Crear URL y forzar descarga
            const blob = new Blob([response.data], {
                type: response.headers['content-type'] || 'application/octet-stream'
            })
            const url = window.URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = fileName
            document.body.appendChild(link)
            link.click()
            link.remove()
            window.URL.revokeObjectURL(url)

        } catch (err) {
            console.error("Error al exportar Excel:", err)
            alert(`Error al exportar Excel: ${err.response?.data?.error || err.message}`)
        }
    }

    const [headerPage, setHeaderPage] = useState(1);
    const [editingRowId, setEditingRowId] = useState(null);
    const [editedData, setEditedData] = useState({});
    const getRowBackgroundColor = (dato) => "inherit";
    const handleEditingRowChange = (field, value) => {
        setEditingRowData(prevData => ({ ...prevData, [field]: value }));
    };

    const handleSaveClick = async () => {
        console.log("handleSaveClick: editedData:", editedData);
        if (!editedData || Object.keys(editedData).length === 0) {
            console.error("handleSaveClick: editedData está vacío.");
            alert("Error: Datos de edición no se han cargado.");
            return;
        }
        if (!editedData.registro_ppu) {
            console.error("handleSaveClick: Falta registro_ppu en editedData:", editedData);
            alert("Error: Falta registro_ppu en los datos a actualizar.");
            return;
        }
        try {
            // Ejemplo de prefijo "CASO " automático
            if (
                editedData.origen &&
                /^\d/.test(editedData.origen) &&
                !editedData.origen.startsWith("CASO ")
            ) {
                editedData.origen = `CASO ${editedData.origen}`;
            }

            // Eliminamos campos que no apliquen al tipo de registro, si así lo requieren
            const { item, ...dataToSend } = editedData;
            if (tipoRegistro === "LEGAJO") {
                delete dataToSend.informe_juridico;
            }
            if (tipoRegistro === "DENUNCIA") {
                delete dataToSend.origen;
            }

            console.log("handleSaveClick: Datos a enviar:", dataToSend);

            await axios.post(`${API_BASE_URL}/api/actualizar_caso`, {
                registro_ppu: dataToSend.registro_ppu,
                data: dataToSend
            });
            setDatos(
                datos.map((d) => (d.registro_ppu === dataToSend.registro_ppu ? dataToSend : d))
            );
            setEditingRowId(null);
            setEditedData({});
            alert("Caso actualizado.");
        } catch (error) {
            console.error("handleSaveClick: Error en la actualización:", error);
            alert(`Error: ${error.response?.data?.error || error.message}`);
        }
    };
    // Ejemplo de función para activar la edición de una fila
    const handleEditClick = (dato) => {
        if (role === "admin") {
            setEditedData({
                registro_ppu: dato.registro_ppu,
                e_situacional: dato.e_situacional,
                abogado: dato.abogado,
                denunciado: dato.denunciado,
                origen: dato.origen,
                "nr de exp completo": dato["nr de exp completo"],
                delito: dato.delito,
                departamento: dato.departamento,
                fiscalia: dato.fiscalia,
                juzgado: dato.juzgado,
                informe_juridico: dato.informe_juridico,
                fecha_ingreso: dato.fecha_ingreso,
                last_modified: dato.last_modified,
                etiqueta: dato.etiqueta
            });
        } else if (role === "user") {
            // Al ser "user", solo preparamos 'registro_ppu' y 'etiqueta'
            setEditedData({
                registro_ppu: dato.registro_ppu,
                etiqueta: dato.etiqueta
            });
        }

        setEditingRowId(dato.registro_ppu);
    };


    // Estados y funciones para el modal avanzado y datos del caso










  

    // 2) Handler para selección de fiscalía
    

    // 3) Handler para cambio en “Caso fiscal corto”


    // Estados y funciones para el historial
    const [openHistorial, setOpenHistorial] = useState(false);
    const handleCloseHistorial = () => {
        setOpenHistorial(false);
    };
    const [selectedRegistroPPU, setSelectedRegistroPPU] = useState("");
    const [showSituacionHistory, setShowSituacionHistory] = useState(false);
    const [versionActual, setVersionActual] = useState(null);

    const [situacionHistoryData, setSituacionHistoryData] = useState([]);
    const [advancedModalOpen, setAdvancedModalOpen] = useState(false);








    // Helper para extraer año de un 'registro_ppu' del tipo "D-123-2025-A" o "LEG-50-2025"
    // Helper para extraer el año exacto del registro_ppu según los patrones backend
    // Devuelve el segmento que realmente sea un año (4 dígitos) recorriendo
    // los componentes del PPU desde el final hacia el inicio.
    const extraerYear = (ppu = '') => {
        if (!ppu) return null;

        const partes = String(ppu).split('-');

        // Recorremos de derecha a izquierda para priorizar el último "⁽4 dígitos⁾"
        for (let i = partes.length - 1; i >= 0; i--) {
            if (/^\d{4}$/.test(partes[i])) {
                return partes[i];          // ← año encontrado (p.ej. 2018, 2023…)
            }
        }

        return null;                    // si no se encontró ningún año válido
    };




    // Dentro del componente Principal(), justo antes del `return (…)`:
    const datosPorAno = useMemo(() => {
        const grupos = {};
        datos.forEach(dato => {
            const year = extraerYear(dato.registro_ppu) || "Sin Año";
            if (!grupos[year]) grupos[year] = [];
            grupos[year].push(dato);
        });

        // Ordena cada grupo priorizando “D-” antes de “L.”, luego por número y sufijo
        Object.values(grupos).forEach(filas => {
            filas.sort((a, b) => {
                // 1) Detectar tipo: denuncias (“D-”) vs legajos (“L.”)
                const tipoA = a.registro_ppu?.startsWith("D-") ? 0 : 1;
                const tipoB = b.registro_ppu?.startsWith("D-") ? 0 : 1;
                if (tipoA !== tipoB) return tipoA - tipoB;

                // 2) Ambos son del mismo tipo: extraer número y sufijo
                const parsePPU = ppu => {
                    const m = String(ppu).match(/^[A-Z]\.?\s*-\s*(\d+)-\d{4}(?:-(\w+))?/i);
                    if (!m) return { num: 0, suf: "" };
                    return { num: parseInt(m[1], 10), suf: m[2] || "" };
                };
                const pa = parsePPU(a.registro_ppu);
                const pb = parsePPU(b.registro_ppu);

                if (pa.num !== pb.num) return pa.num - pb.num;
                if (pa.suf === pb.suf) return 0;
                if (pa.suf === "") return -1;
                if (pb.suf === "") return 1;
                return pa.suf.localeCompare(pb.suf);
            });
        });

        const arrayOrdenado = Object.entries(grupos)
            .sort((a, b) => {
                if (a[0] === "Sin Año") return 1;
                if (b[0] === "Sin Año") return -1;
                return Number(b[0]) - Number(a[0]);
            });
        return arrayOrdenado;
    }, [datos]);




    /* ================== DataGrid helpers ================== */
    /* 1 ▸ Columnas ──────── */
    const fullColumns = [
        { field: 'registro_ppu', headerName: 'PPU', width: 120 },
        { field: 'e_situacional', headerName: 'Situación', width: 110 },
        { field: 'abogado', headerName: 'Abogado', width: 130 },
        { field: 'denunciado', headerName: 'Denunciado', flex: 1 },
        { field: 'origen', headerName: 'Fiscal corto / Exp.', flex: 1 },
        { field: 'nrExpCompleto', headerName: 'Fiscal completo', flex: 1 },
        { field: 'delito', headerName: 'Delito', flex: 1 },
        { field: 'departamento', headerName: 'Dpto.', width: 100 },
        { field: 'fiscalia', headerName: 'Fiscalía', flex: 1 },
        { field: 'juzgado', headerName: 'Juzgado', flex: 1 },
        { field: 'informe_juridico', headerName: 'Informe Jurídico', flex: 1 },
        { field: 'fecha_ingreso', headerName: 'Ingreso', width: 115 },
        { field: 'last_modified', headerName: 'Modificación', width: 115 },

        /* ────── AQUÍ SE AÑADE LA CLASE CONDICIONAL ────── */
        {
            field: 'etiqueta',
            headerName: 'Etiqueta',
            width: 110,
            cellClassName: (params) =>
                params.value === 'ARCHIVO' ? 'etiqueta-archivo' : '',
        },

        {
            field: 'acciones',
            headerName: 'Acciones',
            width: 200,
            sortable: false,
            filterable: false,
            renderCell: ({ row }) => {
                if (row.type === 'yearHeader') return null;
                const isEditing = editingRowId === row.registro_ppu;
                return (
                    <Box display="flex" gap={1}>
                        <Button
                            size="small"
                            variant="contained"
                            onClick={() =>
                                isEditing ? handleSaveClick() : handleEditClick(row)
                            }
                        >
                            {isEditing ? 'Guardar' : 'Modificar'}
                        </Button>
                        <Button
                            size="small"
                            variant="outlined"
                            onClick={() => {
                                setSelectedRegistroPPU(row.registro_ppu);
                                setAdvancedModalOpen(true);
                            }}
                        >
                            Avanzado
                        </Button>
                    </Box>
                );
            },
        },
    ];


    /* 2 ▸ Column-visibility según “headerPage” ───── */
    const half = Math.ceil(fullColumns.length / 2);     // 15 → 8 & 7
    const columnVisibilityModel = useMemo(() => {
        const visibleFirst = new Set(fullColumns.slice(0, half).map(c => c.field));
        const visibleSecond = new Set(fullColumns.slice(half).map(c => c.field));
        const visible = headerPage === 1 ? visibleFirst : visibleSecond;

        /* Registro PPU y Acciones deben estar siempre */
        visible.add('registro_ppu').add('acciones');

        const model = {};
        fullColumns.forEach(c => { model[c.field] = visible.has(c.field); });
        return model;
    }, [headerPage]);

    /* 3 ▸ Transformar datos → rows (con alias y fila-año) ───── */
    const gridRows = useMemo(() => {
        const rows = [];
        datosPorAno.forEach(([year, filas]) => {
            rows.push({
                id: `year-${year}`,
                type: 'yearHeader',
                registro_ppu: `AÑO ${year}`,
            });
            filas.forEach(f => rows.push({
                id: f.registro_ppu,
                ...f,
                nrExpCompleto: f['nr de exp completo'],
            }));
        });
        return rows;
    }, [datosPorAno]);

    /* 4 ▸ Render cell especial para cabecera-año + edición condicional ───── */
    const renderEditable = (params) => {
        /* fila de año → celda fusionada visualmente */
        if (params.row.type === 'yearHeader') {
            return (
                <Box sx={{ fontWeight: 'bold', width: '100%', textAlign: 'center' }}>
                    {params.value}
                </Box>
            );
        }
        /* celdas normales + edición */
        if (editingRowId === params.row.registro_ppu) {
            if (role === 'admin' || (role === 'user' && params.field === 'etiqueta')) {
                return (
                    <TextField
                        value={editedData[params.field] ?? ''}
                        onChange={(e) =>
                            setEditedData({ ...editedData, [params.field]: e.target.value })
                        }
                        variant="outlined"
                        size="small"
                        fullWidth
                    />
                );
            }
        }
        return params.value;
    };

    /* añadimos ‘renderCell’ a todas las columnas salvo ‘acciones’ */
    const columns = fullColumns.map(col =>
        col.field === 'acciones' ? col : { ...col, renderCell: renderEditable });

    /* 5 ▸ Función para asignar clases de fila — ahora detecta “Archivo” */
    /* 5 ▸ Función para asignar clases de fila — ahora detecta “ARCHIVO” sin importar el caso */
    const getRowClassName = (params) => {
        const classes = [];
        if (params.row.type === 'yearHeader') classes.push('year-row');

        if (
            String(params.row.etiqueta || '')
                .trim()
                .toUpperCase() === 'ARCHIVO'
        ) {
            classes.push('row-archivo');
        }

        return classes.join(' ');
    };


    // ─────────────────────────  CustomToolbar completo  ─────────────────────────
    // Archivo: src/components/common-principal/BusquedaRapida.jsx

    const abogadosPermitidos = {
        jpolom: 'POLO',
        enavarro: 'NAVARRO',
        mpalacios: 'PALACIOS',
        imartinez: 'MARTINEZ',
        mrojas: 'ROJAS',
        mfrisancho: 'FRISANCHO',
        tpomar: 'POMAR',
        dflores: 'FLORES',
        zaguilar: 'AGUILAR',
        mmau: 'MAU',
        fascurra: 'ASCURRA',
        ncuba: 'CUBA'
    };

    const CustomToolbar = () => {
        const [openElegirAbogado, setOpenElegirAbogado] = useState(false);
        const [abogadoSeleccionadoLocal, setAbogadoSeleccionadoLocal] = useState(selectedAbogado || '');

        const filasParaExcel = gridRows.filter(r => r.type !== 'yearHeader');

        const opcionesAbogado = useMemo(() => {
            const labelsPermitidos = new Set(Object.values(abogadosPermitidos));
            const setLabels = new Set(
                filasParaExcel
                    .map(r => (r.abogado || '').toString().trim().toUpperCase())
                    .filter(a => a && labelsPermitidos.has(a))
            );
            return Array.from(setLabels).sort();
        }, [filasParaExcel]);

        const handleExportClick = () => {
            if (role === 'admin') {
                exportarExcelCustom(filasParaExcel, columns);
            } else {
                const candidato = (selectedAbogado || '').toString().trim().toUpperCase();
                const defaultOpcion = opcionesAbogado.includes(candidato) ? candidato : (opcionesAbogado[0] || '');
                setAbogadoSeleccionadoLocal(defaultOpcion);
                setOpenElegirAbogado(true);
            }
        };

        const confirmarExportPorAbogado = () => {
            const abogadoMatch = (abogadoSeleccionadoLocal || '').toString().trim().toUpperCase();
            const filasFiltradas = filasParaExcel.filter(r =>
                (r.abogado || '').toString().trim().toUpperCase() === abogadoMatch
            );

            if (filasFiltradas.length === 0) {
                alert('No hay registros de su selección');
                return;
            }

            exportarExcelCustom(filasFiltradas, columns);
            setOpenElegirAbogado(false);
        };

        return (
            <GridToolbarContainer sx={{ gap: 1, p: 1 }}>
                <GridToolbarColumnsButton />
                <GridToolbarFilterButton />
                <GridToolbarDensitySelector />

                <Button
                    startIcon={<DownloadIcon />}
                    onClick={handleExportClick}
                    sx={{ textTransform: 'none' }}
                >
                    Exportar&nbsp;selección&nbsp;actual
                </Button>

                <GridToolbarQuickFilter
                    placeholder="Búsqueda local"
                    quickFilterParser={input => input.split(/[, ]+/).filter(Boolean)}
                />

                <Dialog open={openElegirAbogado} onClose={() => setOpenElegirAbogado(false)} fullWidth maxWidth="xs">
                    <DialogTitle>Elija abogado</DialogTitle>
                    <DialogContent>
                        <TextField
                            select
                            fullWidth
                            label="Abogado"
                            value={abogadoSeleccionadoLocal}
                            onChange={(e) => setAbogadoSeleccionadoLocal(e.target.value)}
                            autoFocus
                            margin="dense"
                        >
                            {opcionesAbogado.map(label => (
                                <MenuItem key={label} value={label}>
                                    {label}
                                </MenuItem>
                            ))}
                        </TextField>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setOpenElegirAbogado(false)}>Cancelar</Button>
                        <Button
                            variant="contained"
                            onClick={confirmarExportPorAbogado}
                            disabled={!abogadoSeleccionadoLocal?.trim()}
                        >
                            Exportar
                        </Button>
                    </DialogActions>
                </Dialog>
            </GridToolbarContainer>
        );
    };

    const [colVis, setColVis] = useState(columnVisibilityModel);   // copia inicial

    /* —— Plantilla completa en castellano —— */
    const localeES = {
        ...esES.components.MuiDataGrid.defaultProps.localeText,

        /* ▸ Overlays */
        noRowsLabel: 'Sin filas',
        noResultsOverlayLabel: 'Sin resultados',
        errorOverlayDefaultLabel: 'Ha ocurrido un error.',

        /* ▸ Barra de herramientas */
        toolbarColumns: 'Columnas',
        toolbarColumnsLabel: 'Mostrar selector de columnas',
        toolbarFilters: 'Filtros',
        toolbarFiltersLabel: 'Mostrar filtros',
        toolbarFiltersTooltipHide: 'Ocultar filtros',
        toolbarFiltersTooltipShow: 'Mostrar filtros',
        toolbarDensity: 'Densidad',
        toolbarDensityLabel: 'Densidad',
        toolbarDensityCompact: 'Compacta',
        toolbarDensityStandard: 'Estándar',
        toolbarDensityComfortable: 'Cómoda',
        toolbarExport: 'Exportar',
        toolbarExportLabel: 'Exportar',
        toolbarExportCSV: 'Descargar CSV',
        toolbarExportPrint: 'Imprimir',
        toolbarExportExcel: 'Descargar Excel',
        toolbarQuickFilterPlaceholder: 'Buscar…',
        toolbarQuickFilterLabel: 'Buscar',
        toolbarQuickFilterDeleteIconLabel: 'Limpiar',

        /* ▸ Panel de columnas */
        columnsPanelTextFieldLabel: 'Buscar columna',
        columnsPanelTextFieldPlaceholder: 'Título',
        columnsPanelDragIconLabel: 'Reordenar',
        columnsPanelShowAllButton: 'Mostrar todas',
        columnsPanelHideAllButton: 'Ocultar todas',

        /* ▸ Panel de filtros */
        filterPanelAddFilter: 'Añadir filtro',
        filterPanelDeleteIconLabel: 'Eliminar',
        filterPanelOperators: 'Operadores',
        filterPanelOperatorAnd: 'Y',
        filterPanelOperatorOr: 'O',
        filterPanelColumns: 'Columnas',
        filterPanelInputLabel: 'Valor',
        filterPanelInputPlaceholder: 'Valor de filtro…',

        /* ▸ Operadores de filtro */
        filterOperatorContains: 'contiene',
        filterOperatorEquals: 'igual a',
        filterOperatorStartsWith: 'empieza por',
        filterOperatorEndsWith: 'termina en',
        filterOperatorIs: 'es',
        filterOperatorNot: 'no es',
        filterOperatorAfter: 'después de',
        filterOperatorOnOrAfter: 'en o después de',
        filterOperatorBefore: 'antes de',
        filterOperatorOnOrBefore: 'en o antes de',
        filterOperatorIsEmpty: 'está vacío',
        filterOperatorIsNotEmpty: 'no está vacío',
        filterOperatorIsAnyOf: 'es cualquiera de',

        /* ▸ Valores booleanos del filtro */
        filterValueAny: 'cualquiera',
        filterValueTrue: 'verdadero',
        filterValueFalse: 'falso',

        /* ▸ Encabezado de columna */
        columnHeaderFiltersTooltipActive: (count) =>
            count !== 1 ? `${count} filtros` : `${count} filtro`,
        columnHeaderFiltersLabel: 'Mostrar filtros',
        columnHeaderSortIconLabel: 'Ordenar',

        /* ▸ Footer */
        footerRowSelected: (count) =>
            count !== 1
                ? `${count.toLocaleString()} filas seleccionadas`
                : `${count.toLocaleString()} fila seleccionada`,
        footerTotalRows: 'Filas totales:',
        footerTotalVisibleRows: (visibleCount, totalCount) =>
            `${visibleCount.toLocaleString()} de ${totalCount.toLocaleString()}`,
        footerPaginationRowsPerPage: 'Filas por página:',
        footerPaginationOf: (first, last, total) =>
            `${first}–${last} de ${total.toLocaleString()}`,
        footerFilteredRowsCount: (count) =>
            `${count.toLocaleString()} resultado(s)`,

        /* ▸ Agrupación (DataGrid Pro/Premium) */
        groupedColumnHeaderName: 'Agrupado',
        groupedColumnTooltip: 'Desagrupar',

        ungroupedColumnHeaderName: 'Desagrupado',
        ungroupedColumnTooltip: 'Agrupar por esta columna',

        /* ▸ Columnas agrupadas arrastrables (v6+) */
        rowGroupPanelOnDrop: 'Suelta aquí una columna para agrupar',
        rowGroupPanelTitle: 'Columnas agrupadas',

        /* ▸ Column reordering / pinning */
        columnMenuUnsort: 'Quitar orden',
        columnMenuSortAsc: 'Orden ascendente',
        columnMenuSortDesc: 'Orden descendente',
        columnMenuFilter: 'Filtrar',
        columnMenuHideColumn: 'Ocultar',
        columnMenuShowColumns: 'Mostrar columnas',
        columnMenuManageColumns: 'Gestionar columnas',
        columnMenuPinLeft: 'Fijar a la izquierda',
        columnMenuPinRight: 'Fijar a la derecha',
        columnMenuUnpin: 'Desfijar',

        /* ▸ Agrupación por columnas (drag & drop header) */
        rowGroupPanelPlaceholder: 'Arrastra aquí encabezados…',

        /* ▸ Detalles de fila (tree data) */
        treeDataGroupingHeaderName: 'Jerarquía',
        treeDataExpand: 'ver hijos',
        treeDataCollapse: 'ocultar hijos',
        groupingColumnHeaderName: 'Grupo',

        /* ▸ Columnas de detalle de fila (master/detail) */
        detailPanelToggle: 'Alternar panel de detalle',
        expandDetailPanel: 'Expandir',
        collapseDetailPanel: 'Contraer',
    };
    // ─── Early return SOLO después de definir todos los hooks ───────────
    if (openBusquedaRapida) {
        return (
            <BusquedaRapida
                open={openBusquedaRapida}
                onClose={() => setOpenBusquedaRapida(false)}
            />
        );
    }
    return (
        <>
            {tab === 0 && (
                <>
                    {/* ➜ Botón de Ingresos (aparece si whoami.role === 'admin') */}
                    <Box mb={2}>
                        <Ingresos onRefresh={() => buscarDatos(1, query)} query={query} />

                    </Box>

                    <Button
                        variant="contained"
                        color="info"
                        onClick={() => setOpenBusquedaRapida(true)}
                    >
                        Edición Rápida - recepción directa
                    </Button>


                    {/* El modal externo */}
                    <BusquedaRapida
                        open={openBusquedaRapida}
                        onClose={() => setOpenBusquedaRapida(false)}
                    />
                    {searchMode && queryNotificacion.trim() === "" ? (
                        <Typography variant="body1" align="center">
                            Ingrese un criterio de búsqueda para mostrar resultados.
                        </Typography>
                    ) : (
                        <>
                            <Box mb={2}>
                                <Grid container spacing={2} alignItems="center">
                                    {/* 1) Buscador Global */}
                                    <Grid item xs={12} md={3}>
                                        <TextField
                                            label="Búsqueda global"
                                            variant="outlined"
                                            value={query}
                                            onChange={handleQueryChange}
                                            fullWidth
                                        />
                                    </Grid>

                                    {/* 2) Filtro Año */}
                                    <Grid item xs={6} md={2}>
                                        <FormControl fullWidth size="small">
                                            <InputLabel id="filtro-year-label">Año</InputLabel>
                                            <Select
                                                labelId="filtro-year-label"
                                                // Si availableYears aún está vacío, mostramos valor "" para evitar out-of-range
                                                value={availableYears.length > 0 ? filtroYear : ""}
                                                label="Año"
                                                onChange={(e) => {
                                                    setFiltroYear(e.target.value);
                                                    setPage(1);
                                                    buscarDatos(1, query);
                                                }}
                                            >
                                                {/* Sólo listamos los años que vienen de availableYears */}
                                                {availableYears.map((yr) => (
                                                    <MenuItem key={yr} value={yr}>
                                                        {yr}
                                                    </MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>

                                    </Grid>

                                    {/* 3) Filtro Tipo */}
                                    <Grid item xs={6} md={2}>
                                        <FormControl fullWidth size="small">
                                            <InputLabel id="filtro-tipo-label">Tipo</InputLabel>
                                            <Select
                                                labelId="filtro-tipo-label"
                                                value={filtroTipo}
                                                label="Tipo"
                                                onChange={(e) => {
                                                    setFiltroTipo(e.target.value);
                                                    setPage(1);
                                                    buscarDatos(1, query);
                                                }}
                                            >
                                                <MenuItem value="ALL">Todos</MenuItem>
                                                <MenuItem value="DENUNCIA">Denuncias</MenuItem>
                                                <MenuItem value="LEGAJO">Legajos</MenuItem>
                                            </Select>
                                        </FormControl>
                                    </Grid>

                                    <Grid item xs={12} md={3}>
                                        {role === "admin" ? (
                                            <LawyerFilter
                                                role={role}
                                                username={username}
                                                selectedAbogadoPlazos={selectedAbogado}
                                                setSelectedAbogadoPlazos={setSelectedAbogado}
                                                debouncedBuscarPlazosData={buscarDatos}
                                                queryPlazos={query}
                                                mostrarArchivadosPlazos={mostrarArchivados}
                                                setPagePlazos={setPage}
                                            />
                                        ) : (
                                            <Typography variant="body2" sx={{ fontStyle: "italic" }}>
                                                Abogado: {username.toUpperCase()} (filtro forzado)
                                            </Typography>
                                        )}

                                    </Grid>

                                    <Grid item xs={12} md={2}>
                                        <FormControlLabel
                                            control={
                                                <Checkbox
                                                    checked={mostrarArchivados}
                                                    onChange={(e) => {
                                                        setMostrarArchivados(e.target.checked);
                                                        setPage(1);
                                                        buscarDatos(1, query);
                                                    }}
                                                    color="primary"
                                                />
                                            }
                                            label="¿Mostrar archivados?"
                                        />
                                    </Grid>

                                    <Grid item xs={12} md={2}>
                                        <Button
                                            variant="outlined"
                                            onClick={() => {
                                                setQuery("");
                                                setFiltroYear(availableYears[0] || "");
                                                setFiltroTipo("ALL");
                                                setSelectedAbogado("");
                                                setMostrarArchivados(false);
                                                setPage(1);
                                                buscarDatos(1, "");
                                            }}
                                            fullWidth
                                        >
                                            Limpiar filtros
                                        </Button>
                                    </Grid>

                                    {role === "admin" && (
                                        <Grid item xs={12} md={3}>
                                            <Button
                                                variant="contained"
                                                color="success"
                                                onClick={exportarExcel}
                                                fullWidth
                                                sx={{ height: 56 }}
                                            >
                                                Exportación global
                                            </Button>
                                        </Grid>
                                    )}


                                    </Grid>


                                </Box>

                                <Box mb={2}>
                                    <Typography variant="h6" component="div">
                                        Total de Procesos: {totalRecords}
                                    </Typography>
                                </Box>



                            <Modal open={openHistorial} onClose={handleCloseHistorial}>
                                <Box
                                    sx={{
                                        position: "absolute",
                                        top: "50%",
                                        left: "50%",
                                        transform: "translate(-50%, -50%)",
                                        width: "80%",
                                        maxWidth: "900px",
                                        bgcolor: "background.paper",
                                        border: "2px solid #000",
                                        boxShadow: 24,
                                        p: 4,
                                        maxHeight: "80vh",
                                        overflowY: "auto"
                                    }}
                                >
                                    <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
                                        Historial del Registro: {selectedRegistroPPU}
                                    </Typography>
                                    <Button
                                        variant="contained"
                                        color="secondary"
                                        onClick={() => setShowSituacionHistory(!showSituacionHistory)}
                                        sx={{ mb: 2 }}
                                    >
                                        {showSituacionHistory ? "Ver Historial Completo" : "Historial de Situación"}
                                    </Button>
                                    {!showSituacionHistory ? (
                                        <>
                                            <Typography variant="h6" component="h3" style={{ marginTop: "20px" }}>
                                                Versión Actual
                                            </Typography>
                                            {versionActual ? (
                                                <TableContainer component={Paper} sx={{ mt: 1 }}>
                                                    <Table>
                                                        <TableHead>
                                                            <TableRow>
                                                                <TableCell>Version</TableCell>
                                                                <TableCell>Abogado</TableCell>
                                                                <TableCell>Registro PPU</TableCell>
                                                                <TableCell>Denunciado</TableCell>
                                                                <TableCell>Caso fiscal corto</TableCell>
                                                                <TableCell>Juzgado</TableCell>
                                                                <TableCell>Fiscalia</TableCell>
                                                                <TableCell>Departamento</TableCell>
                                                                <TableCell>Situación</TableCell>
                                                                <TableCell>Fecha versión</TableCell>
                                                                <TableCell>Autor</TableCell>
                                                            </TableRow>
                                                        </TableHead>
                                                        <TableBody>
                                                            <TableRow>
                                                                <TableCell>{versionActual.version_id}</TableCell>
                                                                <TableCell>{versionActual.abogado}</TableCell>
                                                                <TableCell>{versionActual.registro_ppu}</TableCell>
                                                                <TableCell>{versionActual.denunciado}</TableCell>
                                                                <TableCell>{versionActual.origen}</TableCell>
                                                                <TableCell>{versionActual.juzgado}</TableCell>
                                                                <TableCell>{versionActual.fiscalia}</TableCell>
                                                                <TableCell>{versionActual.departamento}</TableCell>
                                                                <TableCell>{versionActual.e_situacional}</TableCell>
                                                                <TableCell>{versionActual.fecha_version}</TableCell>
                                                                <TableCell>N/A</TableCell>
                                                            </TableRow>
                                                        </TableBody>
                                                    </Table>
                                                </TableContainer>
                                            ) : (
                                                <Typography>No hay datos de la versión actual.</Typography>
                                            )}
                                            <Typography variant="h6" component="h3" style={{ marginTop: "20px" }}>
                                                Historial de Versiones Anteriores
                                            </Typography>
                                            {historialData.length > 0 ? (
                                                <TableContainer component={Paper} sx={{ mt: 1 }}>
                                                    <Table>
                                                        <TableHead>
                                                            <TableRow>
                                                                <TableCell>Version</TableCell>
                                                                <TableCell>Abogado</TableCell>
                                                                <TableCell>Registro PPU</TableCell>
                                                                <TableCell>Denunciado</TableCell>
                                                                <TableCell>Caso fiscal corto</TableCell>
                                                                <TableCell>Juzgado</TableCell>
                                                                <TableCell>Fiscalia</TableCell>
                                                                <TableCell>Departamento</TableCell>
                                                                <TableCell>Situación</TableCell>
                                                                <TableCell>Fecha versión</TableCell>
                                                                <TableCell>Autor</TableCell>
                                                            </TableRow>
                                                        </TableHead>
                                                        <TableBody>
                                                            {historialData.map((entry, index) => (
                                                                <TableRow key={index}>
                                                                    <TableCell>{entry.version_id}</TableCell>
                                                                    <TableCell>{entry.abogado}</TableCell>
                                                                    <TableCell>{entry.registro_ppu}</TableCell>
                                                                    <TableCell>{entry.denunciado}</TableCell>
                                                                    <TableCell>{entry.origen}</TableCell>
                                                                    <TableCell>{entry.juzgado}</TableCell>
                                                                    <TableCell>{entry.fiscalia}</TableCell>
                                                                    <TableCell>{entry.departamento}</TableCell>
                                                                    <TableCell>{entry.e_situacional}</TableCell>
                                                                    <TableCell>{entry.fecha_version}</TableCell>
                                                                    <TableCell>{entry.usuario_modificacion}</TableCell>
                                                                </TableRow>
                                                            ))}
                                                        </TableBody>
                                                    </Table>
                                                </TableContainer>
                                            ) : (
                                                <Typography>No hay datos de historial anteriores.</Typography>
                                            )}
                                        </>
                                    ) : (
                                        <>
                                            <Typography variant="h6" component="h3" style={{ marginTop: "20px" }}>
                                                Historial de Cambios en la Situación
                                            </Typography>
                                            {situacionHistoryData.length > 0 ? (
                                                <TableContainer component={Paper} sx={{ mt: 1 }}>
                                                    <Table>
                                                        <TableHead>
                                                            <TableRow>
                                                                <TableCell>Versión</TableCell>
                                                                <TableCell>Abogado</TableCell>
                                                                <TableCell>Caso fiscal corto</TableCell>
                                                                <TableCell>Situación</TableCell>
                                                                <TableCell>Ruta PDF</TableCell>
                                                            </TableRow>
                                                        </TableHead>
                                                        <TableBody>
                                                            {situacionHistoryData.map((entry, i) => (
                                                                <TableRow key={i}>
                                                                    <TableCell>{entry.version_id}</TableCell>
                                                                    <TableCell>{entry.abogado}</TableCell>
                                                                    <TableCell>{entry.origen}</TableCell>
                                                                    <TableCell>{entry.e_situacional}</TableCell>
                                                                    <TableCell>
                                                                        {entry.ruta ? (
                                                                            <a
                                                                                href={`file://${entry.ruta}`}
                                                                                style={{ textDecoration: "none", color: "blue" }}
                                                                                onClick={(e) => {
                                                                                    e.preventDefault();
                                                                                    window.open(
                                                                                        `${API_BASE_URL}/api/descargar_pdf?ruta=${encodeURIComponent(
                                                                                            entry.ruta
                                                                                        )}`,
                                                                                        "_blank"
                                                                                    );
                                                                                }}
                                                                            >
                                                                                Ver PDF
                                                                            </a>
                                                                        ) : (
                                                                            "Sin PDF"
                                                                        )}
                                                                    </TableCell>
                                                                </TableRow>
                                                            ))}
                                                        </TableBody>
                                                    </Table>
                                                </TableContainer>
                                            ) : (
                                                <Typography>No hay cambios en la situación.</Typography>
                                            )}
                                        </>
                                    )}
                                </Box>
                            </Modal>
                            <Modal open={advancedModalOpen} onClose={() => setAdvancedModalOpen(false)}>
                                <Box
                                    sx={{
                                        position: "absolute",
                                        top: "50%",
                                        left: "50%",
                                        transform: "translate(-50%, -50%)",
                                        width: 400,
                                        bgcolor: "background.paper",
                                        border: "2px solid #000",
                                        boxShadow: 24,
                                        p: 4
                                    }}
                                >
                                    <Button
                                        variant="contained"
                                        color="secondary"
                                        onClick={() => {
                                            // Lógica para abrir historial avanzado
                                            setSelectedRegistroPPU(selectedRegistroPPU);
                                            setAdvancedModalOpen(false);
                                        }}
                                        fullWidth
                                    >
                                        Historial
                                    </Button>
                                </Box>
                            </Modal>

                            {/* ───── Tabla principal (DataGrid virtualizado) ───── */}
                            <Box sx={{ height: 600, width: '100%' }}>
                                <DataGrid
                                    rows={gridRows}
                                    columns={columns}
                                    localeText={localeES}
                                    slots={{ toolbar: CustomToolbar }}
                                    getRowId={(r) => r.id}
                                    columnVisibilityModel={colVis}
                                    onColumnVisibilityModelChange={(newModel) => setColVis(newModel)}
                                    disableRowSelectionOnClick
                                    getRowHeight={(params) =>
                                        params.model.type === 'yearHeader' ? 32 : 'auto'
                                    }
                                    getRowClassName={getRowClassName}
                                    pagination
                                    pageSizeOptions={[50, 100, 200]}
                                    initialState={{
                                        pagination: { paginationModel: { pageSize: 50 } },
                                    }}
                                    sx={{
                                        fontSize: '0.75rem',

                                        /* —— comportamiento por defecto de TODA celda —— */
                                        '& .MuiDataGrid-cell': {
                                            whiteSpace: 'normal !important',   // permite el salto de línea
                                            wordBreak: 'break-word',           // corta palabras muy largas
                                            lineHeight: '1.25rem',             // un poco más de altura
                                            padding: '6px 8px',                // margen interno uniforme
                                            alignItems: 'flex-start',          // texto pegado arriba
                                            borderRight: '1px solid #d0d0d0',  // NUEVO: línea vertical entre celdas
                                        },

                                        /* —— línea horizontal entre filas —— */
                                        '& .MuiDataGrid-row': {
                                            borderBottom: '1px solid #d0d0d0',
                                        },

                                        /* —— cabeceras —— */
                                        '& .MuiDataGrid-columnHeader': {
                                            whiteSpace: 'normal',
                                            lineHeight: '1.2rem',
                                            padding: '6px 8px',
                                            borderRight: '1px solid #d0d0d0',  // línea vertical en encabezados
                                        },

                                        /* —— quita la línea derecha en la última columna —— */
                                        '& .MuiDataGrid-columnHeader:last-of-type, & .MuiDataGrid-cell:last-of-type': {
                                            borderRight: 'none',
                                        },

                                        /* —— filas-año —— */
                                        '& .year-row .MuiDataGrid-cell': {
                                            fontWeight: 'bold',
                                            backgroundColor: '#e0e0e0',
                                            borderBottom: '1px solid #bdbdbd',
                                        },
                                        '& .year-row .MuiDataGrid-cell:not(:first-of-type)': {
                                            visibility: 'hidden',
                                        },
                                        /* —— resaltado de fila cuando etiqueta === "Archivo" —— */
                                        '& .row-archivo .MuiDataGrid-cell': {
                                            backgroundColor: '#ffebee',
                                            color: '#b71c1c',
                                        },
                                    }}
                                />

                            </Box>


                           

                            {/* —————————————— */}

                        </>
                    )}
                </>
            )}
        </>
    );
};

export default Principal;
