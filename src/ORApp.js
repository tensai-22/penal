import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import axios, { CancelToken } from 'axios';

import {
    Table, TableHead, TableRow, TableCell, TableBody, TableContainer,
    Paper, TextField, Button, Pagination, Box, Modal, Select,
    MenuItem, InputLabel, FormControl, FormControlLabel, Checkbox,
    Grid, Typography, Toolbar, AppBar, Tabs, Tab, Autocomplete
} from '@mui/material';
import { useDropzone } from 'react-dropzone';
import debounce from 'lodash.debounce';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider, DateTimePicker, DesktopDatePicker } from '@mui/x-date-pickers';
import { format } from 'date-fns';
import { addBusinessDays, parseISO, differenceInBusinessDays } from 'date-fns';
import FiscaliaAutocomplete from './FiscaliaAutocomplete';
import { es } from 'date-fns/locale';
import { parse } from 'date-fns';
import Popper from '@mui/material/Popper';
import Notifications from './components/Notifications.jsx';
import IconButton from '@mui/material/IconButton';
import HistoryIcon from '@mui/icons-material/History';
import Consulta from './components/consulta.jsx';




const CustomDatePicker = ({ value, onChange }) => (
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={es}>
        <DesktopDatePicker
            inputFormat="dd-MM-yyyy"
            mask="__-__-____"
            value={value}
            onChange={onChange}
            renderInput={(params) => <TextField {...params} variant="standard" />}
        />
    </LocalizationProvider>
);

const minimalStaticColumns = ["fileName", "e_situacional", "accion", "plazo_atencion", "fecha_atencion", "ruta"];

const getColumnOrder = (row) => {
    if (!row) return minimalStaticColumns;
    const allKeys = Object.keys(row);
    const hiddenCols = [
        'id', 'last_modified', 'departamento', 'fecha_de_archivo', 'fecha_e_situacional',
        'fecha_ingreso', 'informe_juridico', 'item', 'denunciado', 'registro_ppu', 'delito',
        'abogado', 'juzgado', 'origen', 'nr de exp completo', 'hash_sha', 'seguimiento', 'audiencia',
        'etiqueta', 'isDuplicate' // <-- Aseguramos que isDuplicate quede oculto
    ];
    const dynamicCols = allKeys.filter(k =>
        !hiddenCols.includes(k) &&
        !minimalStaticColumns.includes(k) &&
        k !== 'e_situacional' &&
        k !== 'fileName' &&
        k !== 'accion' &&
        k !== 'plazo_atencion' &&
        k !== 'fecha_atencion'
    );
    dynamicCols.sort();
    return [...minimalStaticColumns, ...dynamicCols];
};



const CustomDateTimePicker = ({ value, onChange }) => (
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={es}>
        <DateTimePicker
            label="Plazo de Atención"
            inputFormat="dd-MM-yyyy hh:mm a"
            mask="__-__-____ __:__ _aa"
            ampm={true}
            value={value}
            onChange={onChange}
            renderInput={(params) => <TextField {...params} variant="standard" />}
        />
    </LocalizationProvider>
);
// Justo antes de la definición de function App() { ... }

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
    gap: '16px',
};


export { CustomDatePicker, CustomDateTimePicker };
function App() {
    const [useML, setUseML] = useState(false);
    const pdfWindowRef = useRef(null);
    const [openHistorialMinimal, setOpenHistorialMinimal] = useState(false);
    const [existingDisposiciones, setExistingDisposiciones] = useState([]);

    const [queryNotificacion, setQueryNotificacion] = useState('');
    const [query, setQuery] = useState('');
    const [searchMode, setSearchMode] = useState(false);

    const [historialCache, setHistorialCache] = useState({});

    const [editedData, setEditedData] = useState({});

    const [headerPage, setHeaderPage] = useState(1);
    const [advancedModalOpen, setAdvancedModalOpen] = useState(false);
    const [searchField, setSearchField] = useState('legajo');


  

    // Agrega este estado en la parte superior del componente App:
    const [vistaMinimal, setVistaMinimal] = useState(true);
    const columnasMinimal = ["abogado", "registro_ppu", "denunciado", "origen", "nr de exp completo", "juzgado", "delito", "ruta"];


    const [historialData, setHistorialData] = useState([]);
    const [versionActual, setVersionActual] = useState(null);
    const [showSituacionHistory, setShowSituacionHistory] = useState(false);

    const situacionHistoryData = React.useMemo(() => {
        if (!historialData || historialData.length === 0) return [];
        // Primero, ordenamos el historial por fecha_version (ascendente).
        // Suponiendo que la fecha viene en formato 'dd-mm-yyyy' o similar.
        const sortedHistorial = [...historialData].sort((a, b) => {
            // Si la fecha viene en formato dd-mm-yyyy, la convertimos para comparar:
            const partsA = a.fecha_version.split('-');
            const partsB = b.fecha_version.split('-');
            const dateA = new Date(partsA[2], partsA[1] - 1, partsA[0]);
            const dateB = new Date(partsB[2], partsB[1] - 1, partsB[0]);
            return dateA - dateB;
        });
        // Ahora filtramos las filas en las que cambia e_situacional
        const result = [];
        for (let i = 0; i < sortedHistorial.length; i++) {
            if (i === 0) {
                result.push(sortedHistorial[i]);
            } else {
                if (sortedHistorial[i].e_situacional !== sortedHistorial[i - 1].e_situacional) {
                    result.push(sortedHistorial[i]);
                }
            }
        }
        return result;
    }, [historialData]);

    // Debe existir
    const [openRangoModal, setOpenRangoModal] = useState(false);

    // Agregar esta función en tu componente App(), por ejemplo debajo de const [rangoPpuInicio, setRangoPpuInicio]...
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
    const API_BASE_URL = 'http://10.50.5.49:5001';
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

    const editTimeRef = React.useRef('');
    const editAmPmRef = React.useRef('AM');

    const [editingValues, setEditingValues] = useState({});
    const [editDate, setEditDate] = useState(''); // Para la fecha
    const [editTime, setEditTime] = useState(''); // Para la hora
    const [editAmPm, setEditAmPm] = useState('AM'); // Para AM/PM
    const [hourError] = React.useState('');
    const [errors, setErrors] = useState([]); // Para almacenar errores por fila.
    const [cellErrors, setCellErrors] = React.useState({});
    const setHourError = (row, col, error) => {
        setCellErrors((prev) => ({
            ...prev,
            [`${row}-${col}`]: error,
        }));
    };

    const getHourError = (row, col) => {
        return cellErrors[`${row}-${col}`] || '';
    };

    // BORRADO FILA: 
    const handleBorrarFila = async (id) => {
        if (role !== 'admin') {
            alert("No tienes permiso para borrar la fila");
            return;
        }
        if (!window.confirm("¿Estás seguro de que deseas borrar esta fila?")) {
            return;
        }
        try {
            await axios.post(`${API_BASE_URL}/api/eliminar_fila`, { id });
            // Actualiza el estado removiendo la fila borrada
            setPlazosData((prevData) => prevData.filter((row) => row.id !== id));
            alert("Fila eliminada exitosamente.");
        } catch (error) {
            console.error("Error al borrar la fila:", error);
            alert("Error al borrar la fila");
        }
    };




    //------------------------------------------------------
    // 1. Estados y funciones para manejar seguimiento con PDF
    //------------------------------------------------------
    const [openSeguimientoModal, setOpenSeguimientoModal] = useState(false);
    const [rowSeguimiento, setRowSeguimiento] = useState(null);
    const [activeTable, setActiveTable] = useState(null); // Nueva propiedad para identificar la tabla activa

    // PDF seleccionado
    const [seguimientoPDF, setSeguimientoPDF] = useState(null);

    // Abre modal, resetea valores
    const handleOpenSeguimientoModal = (rowData, table) => {
        setRowSeguimiento(rowData);
        setSeguimientoPDF(null);
        setActiveTable(table); // Establece la tabla activa
        setOpenSeguimientoModal(true);
    };

    const handleCloseSeguimientoModal = () => {
        setOpenSeguimientoModal(false);
        setRowSeguimiento(null);
        setSeguimientoPDF(null);
        setActiveTable(null); // Limpia la tabla activa
    };


    // Maneja la subida del PDF (similar a onDrop, pero aquí con input type="file")
    const handlePDFUploadChange = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            setSeguimientoPDF(e.target.files[0]);
        }
    };

    // Filtrar filas con seguimiento === "ATENDIDA" (dentro de buscarPlazosData o en la vista)
    // EJEMPLO: const fetchedData = respuestaDelBack.filter(row => row.seguimiento !== "ATENDIDA");

    const handleGuardarSeguimiento = async () => {
        if (!seguimientoPDF) {
            alert("Debes adjuntar un PDF para continuar");
            return;
        }
        if (!rowSeguimiento) return;

        try {
            // Armar nuevo nombre conservando los espacios: "ESCRITO ABOGADO REGISTRO_PPU ORIGEN.pdf"
            const nuevoNombre = `ESCRITO ${rowSeguimiento.abogado} ${rowSeguimiento.registro_ppu} ${rowSeguimiento.origen || 'NOCASO'}.pdf`;

            const formData = new FormData();
            formData.append('id', rowSeguimiento.id);
            formData.append('registro_ppu', rowSeguimiento.registro_ppu);
            formData.append('abogado', rowSeguimiento.abogado);
            formData.append('caso', rowSeguimiento.origen || 'NOCASO');
            // ¡IMPORTANTE! Cambia este valor a "true" para que el backend procese el PDF.
            formData.append('atendido', 'true');
            formData.append('nuevo_nombre', nuevoNombre);
            formData.append('file', seguimientoPDF);

            // Logs para depuración
            console.log("seguimientoPDF object:", seguimientoPDF);
            console.log("seguimientoPDF.name:", seguimientoPDF.name);
            console.log("seguimientoPDF.size:", seguimientoPDF.size);

            for (let [key, value] of formData.entries()) {
                console.log(`FormData entry - ${key}:`, value);
            }

            // Enviar la solicitud sin forzar el Content-Type (axios lo configura automáticamente)
            const response = await axios.post(`${API_BASE_URL}/api/actualizar_seguimiento`, formData);

            if (response.status === 200) {
                if (!response.data.ruta_respuesta || !response.data.hash_respuesta) {
                    alert("Error: el PDF no se movió correctamente al destino final.");
                    return;
                }

                const updated = [...plazosData];
                const idx = updated.findIndex((r) => r.id === rowSeguimiento.id);
                if (idx !== -1) {
                    updated[idx].seguimiento = "ATENDIDA";
                    updated[idx].ruta_respuesta = response.data.ruta_respuesta;
                    updated[idx].hash_respuesta = response.data.hash_respuesta;
                }
                setPlazosData(updated);

                alert("Seguimiento guardado exitosamente.");
                handleCloseSeguimientoModal();
            } else {
                alert("Error al subir el seguimiento");
            }
        } catch (error) {
            console.error('Error en handleGuardarSeguimiento:', error);
            if (error.response) {
                console.log('Status:', error.response.status);
                console.log('Data:', error.response.data);
            } else {
                console.log('Error de red o sin response:', error.message);
            }
            alert("No se pudo guardar el seguimiento");
        }
    };




    

    // Función para guardar el nuevo valor de seguimiento en el backend
    const actualizarSeguimiento = async (id, nuevoSeguimiento) => {
        try {
            const atendido = nuevoSeguimiento.toLowerCase() === 'true'; // Convierte a booleano según tu backend
            const formData = new FormData(); // Para enviar datos como multipart/form-data
            formData.append("id", id);
            formData.append("atendido", atendido ? "true" : "false");

            await axios.post(`${API_BASE_URL}/api/actualizar_seguimiento`, formData, {
                headers: { "Content-Type": "multipart/form-data" },
            });

            return true;
        } catch (error) {
            console.error("Error al actualizar seguimiento:", error);
            alert("No se pudo actualizar el seguimiento.");
            return false;
        }
    };


    const validateDatos = () => {
        let newErrors = [];
        const regex = /^(\d{1,2})-(\d{1,2})-(\d{4})\s(\d{1,2}):(\d{2})\s(AM|PM)$/;
        for (let i = 0; i < datosMinimal.length; i++) {
            const row = datosMinimal[i];
            if (row.audiencia) {
                const value = row.plazo_atencion ? row.plazo_atencion.trim() : "";
                if (!regex.test(value)) {
                    newErrors.push({
                        row: i,
                        message: `Formato inválido en fila ${i + 1}: debe ser "dd-mm-yyyy hh:mm AM/PM".`
                    });
                }
            } else {
                if (row.plazo_atencion && isNaN(row.plazo_atencion)) {
                    newErrors.push({
                        row: i,
                        message: `'Plazo_atencion' debe ser numérico en fila ${i + 1}.`
                    });
                }
            }
        }
        setErrors(newErrors);
        return newErrors.length === 0;
    };


    const [tab, setTab] = useState(0);
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [role, setRole] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');

    const [datos, setDatos] = useState([]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalRecords, setTotalRecords] = useState(0);
 
    const [selectedAbogado, setSelectedAbogado] = useState('');
    const [mostrarArchivados, setMostrarArchivados] = useState(true);

    const [openModal, setOpenModal] = useState(false);
    const [tipoRegistro, setTipoRegistro] = useState('LEGAJO');
    const [anioRegistro, setAnioRegistro] = useState(new Date().getFullYear().toString());
    const [casoEspecial, setCasoEspecial] = useState(false);
    const [sufijo, setSufijo] = useState('');
    const [numeroManual, setNumeroManual] = useState('');
    const [registroGenerado, setRegistroGenerado] = useState('');
    const [registrosExistentes, setRegistrosExistentes] = useState([]);
    const [fiscaliaOptionsTable, setFiscaliaOptionsTable] = useState([]);
    const [fiscaliaOptionsNuevoCaso, setFiscaliaOptionsNuevoCaso] = useState([]);


    const [inputValues, setInputValues] = useState({});

    const fetchFiscaliasTable = useCallback(
        debounce(async (inputValue) => {
            if (!inputValue) {
                setFiscaliaOptionsTable([]);
                return;
            }
            try {
                const response = await axios.get(`${API_BASE_URL}/api/search_fiscalias`, {
                    params: { query: inputValue }
                });
                setFiscaliaOptionsTable(response.data.data);
            } catch (error) {
                console.error("Error al obtener fiscalias para la tabla:", error);
            }
        }, 500),
        []
    );



    const getRowBackgroundColor = (row) => {
        const etiqueta = row.etiqueta || '';

        if (etiqueta === 'ARCHIVO') {
            return '#f8d7da'; // Rojo claro
        }
        if (etiqueta.toLowerCase().includes('ejecucion')) {
            return '#fff3cd'; // Amarillo claro
        }

        if (row.dias_restantes === "Vencido") {
            return '#f8d7da'; // Rojo
        }
        if (row.dias_restantes === "URGENTE RESOLVER EN EL DIA") {
            return '#fff3cd'; // Amarillo
        }

        return 'transparent';
    };





    const styles = {
        expandedContainer: {
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundColor: "white",
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            padding: "10px",
            overflow: "auto",
        },
        fiscaliaCell: {
            flexBasis: '300px',  // Establece el ancho inicial de la celda fiscalia
            flexGrow: 0,         // No permite que esta celda crezca más allá de su tamaño base
            flexShrink: 0,       // No permite que se encoja
        },
        accionCell: {
            flexBasis: '300px',  // Establece el ancho inicial de la celda acción
            flexGrow: 0,         // No permite que esta celda crezca
            flexShrink: 0,       // No permite que se encoja
        },
        normalContainer: {
            padding: "20px",
        },
        expandedButtons: {
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "10px",
        },
        expandedTable: {
            flexGrow: 1,
            overflow: "auto",
        },
    };

    // Esta constante se usa en otros contextos donde se desea abrir y descargar el PDF.
    const handleRutaClick = (e, ruta) => {
        e.preventDefault();
        const encodedRuta = encodeURIComponent(ruta);
        const url = `${API_BASE_URL}/api/descargar_pdf?ruta=${encodedRuta}`;

        // Abrir el PDF en una nueva pestaña
        window.open(url, '_blank');

        // Descargar una copia
        const link = document.createElement('a');
        link.href = url;
        link.download = ruta.split('\\').pop();
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Esta nueva constante se utilizará en la tabla minimal (o en donde se requiera solo abrir el PDF en una nueva pestaña).
    // Esta función se usará en la tabla minimal para abrir el PDF en una nueva pestaña
    const handleRutaClickMinimal = (e, ruta) => {
        e.preventDefault();
        // Si no se encuentra el nombre del archivo, mostramos un mensaje de error.
        const secureFilename = ruta; // Aquí se asume que ya se pasó el valor correcto (row.ruta o row.fileName)
        if (!secureFilename) {
            alert("No se encontró el nombre del archivo.");
            return;
        }
        // Construimos la URL usando el endpoint "descargar_pdf_minimal"
        const url = `${API_BASE_URL}/api/descargar_pdf_minimal?filename=${encodeURIComponent(secureFilename)}`;

        // Para que se abra siempre en una nueva pestaña, usamos '_blank'
        window.open(url, '_blank');
    };



    const formatDate = (fecha) => {
        if (!fecha) return 'N/A'; // Maneja valores nulos o indefinidos
        try {
            const date = new Date(fecha); // Convierte la cadena a un objeto Date
            if (isNaN(date.getTime())) {
                throw new Error('Invalid date');
            }
            return format(date, 'dd-MM-yyyy'); // Formatea la fecha
        } catch (error) {
            console.error("Error al formatear la fecha:", error);
            return 'Fecha inválida'; // Devuelve un mensaje de error si falla
        }
    };


    const [plazosData, setPlazosData] = useState([]);
    const [loadingPlazos, setLoadingPlazos] = useState(false);
    const [errorPlazos, setErrorPlazos] = useState('');


    const fetchPlazosData = useCallback(async () => {
        setLoadingPlazos(true);
        setErrorPlazos('');

        try {
            const response = await axios.get(`${API_BASE_URL}/api/datapenal_plazos`);
            const fetchedData = response.data.data;
            console.log('Datos recibidos:', fetchedData); // Para depuración

            const updatedData = fetchedData.map(row => {
                const { fecha_atencion, plazo_atencion } = row;

                if (!fecha_atencion || !plazo_atencion) {
                    return { ...row, dias_restantes: 'N/A', sortingValue: Number.MAX_SAFE_INTEGER };
                }

                let diasRestantesString = 'N/A';
                let sortingValue = Number.MAX_SAFE_INTEGER;

                try {
                    // Verificar si plazo_atencion es una fecha completa
                    const isCompleteDate = /\d{2}-\d{2}-\d{4}\s\d{2}:\d{2}/.test(plazo_atencion);

                    if (isCompleteDate) {
                        // Manejo para fechas completas
                        const [datePart, timePart] = plazo_atencion.split(' ');
                        const [day, month, year] = datePart.split('-').map(Number);
                        const [hour, minute] = timePart.split(':').map(Number);

                        const fechaPlazo = new Date(year, month - 1, day, hour, minute);
                        const today = new Date();
                        const diffMs = fechaPlazo - today;

                        if (diffMs < 0) {
                            diasRestantesString = 'Vencido';
                            sortingValue = -3;
                        } else {
                            const totalSegundos = Math.floor(diffMs / 1000);
                            const dias = Math.floor(totalSegundos / 86400);
                            let resto = totalSegundos % 86400;
                            const horas = Math.floor(resto / 3600);
                            resto = resto % 3600;
                            const minutos = Math.floor(resto / 60);

                            const partes = [];
                            if (dias > 0) partes.push(`${dias} DIAS`);
                            if (horas > 0) partes.push(`${horas} HORAS`);
                            if (minutos > 0) partes.push(`${minutos} MINUTOS`);
                            if (partes.length === 0) partes.push("MENOS DE UN MINUTO");

                            diasRestantesString = `FALTA ${partes.join(' Y ')}`;

                            // SortingValue basado en días, horas y minutos
                            sortingValue = dias > 0 ? dias : horas > 0 ? horas / 24 : minutos / 1440;
                        }
                    } else {
                        // Manejo para números enteros (días hábiles)
                        const fechaAtencionISO = fecha_atencion.trim().replace(/\s+/, 'T');
                        const fechaAtencionDate = parseISO(fechaAtencionISO);

                        if (isNaN(fechaAtencionDate)) throw new Error('Fecha inválida');

                        const plazo = parseInt(plazo_atencion, 10);
                        if (isNaN(plazo)) throw new Error('Plazo inválido');

                        const deadline = addBusinessDays(fechaAtencionDate, plazo);
                        const today = new Date();
                        const remainingDays = differenceInBusinessDays(deadline, today);

                        if (remainingDays < 0) {
                            diasRestantesString = 'Vencido';
                            sortingValue = -3;
                        } else if (remainingDays === 1) {
                            diasRestantesString = 'URGENTE RESOLVER EN EL DIA';
                            sortingValue = -2;
                        } else {
                            diasRestantesString = `${remainingDays} dias restantes`;
                            sortingValue = remainingDays;
                        }
                    }
                } catch (error) {
                    console.error(`Error procesando fila con plazo_atencion="${plazo_atencion}" y fecha_atencion="${fecha_atencion}":`, error);
                    diasRestantesString = 'Error en cálculo';
                }

                return {
                    ...row,
                    dias_restantes: diasRestantesString,
                    sortingValue
                };
            });

            // Ordenar los datos antes de asignarlos
            const sortedData = updatedData.sort((a, b) => a.sortingValue - b.sortingValue);
            setPlazosData(sortedData);
        } catch (error) {
            console.error("Error al obtener plazos:", error);
            setErrorPlazos("No se pudo cargar la información de plazos.");
        } finally {
            setLoadingPlazos(false);
        }
    }, [API_BASE_URL]);




    const [nuevoCaso, setNuevoCaso] = useState({
        abogado: '',
        registro_ppu: '',
        denunciado: '',
        origen: '',
        'nr de exp completo': '',
        delito: '',
        departamento: '',
        fiscalia: '',
        juzgado: '',
        informe_juridico: '',
        e_situacional: ''
    });



    const [mostrarExpedienteJuzgado, setMostrarExpedienteJuzgado] = useState(false);
    const [expedienteJuzgado, setExpedienteJuzgado] = useState({
        campo1: '',
        campo2: '',
        campo3: '',
        campo4: '',
        campo5: '',
        campo6: '',
        campo7: ''
    });
    const [erroresExpediente, setErroresExpediente] = useState({});

    // Ponlos juntos en la parte superior (dentro del componente pero fuera del return):


    const [editingRowId, setEditingRowId] = useState(null);
    const [editingRowData, setEditingRowData] = useState({});

    const [fiscaliaOptions, setFiscaliaOptions] = useState([]);
    const [despachoNumber, setDespachoNumber] = useState('');

    const [openHistorial, setOpenHistorial] = useState(false);
    const [selectedRegistroPPU, setSelectedRegistroPPU] = useState('');

    const [alreadyFocusedE, setAlreadyFocusedE] = useState(false);

    const [pdfFiles, setPdfFiles] = useState([]);
    const [datosMinimal, setDatosMinimal] = useState([]);
    const [mostrarTablaMinimal, setMostrarTablaMinimal] = useState(false);
    const [celdasEditadas, setCeldasEditadas] = useState({});

    useEffect(() => {
        if (datosMinimal.length === 0) return;
        // Extraer PPUs nuevas:  
        const ppusNuevos = Array.from(new Set(
            datosMinimal
                .map(row => row.registro_ppu)
                .filter(ppu => !(ppu in historialCache))
        ));
        if (ppusNuevos.length > 0) {
            axios.post(`${API_BASE_URL}/api/historiales`, { registro_ppu: ppusNuevos })
                .then(response => {
                    setHistorialCache(prevCache => ({
                        ...prevCache,
                        ...response.data.historiales
                    }));
                })
                .catch(error => {
                    console.error("Error al precargar historiales:", error);
                });
        }
        // Nota: Se omite historialCache en la lista de dependencias para evitar bucles.
    }, [datosMinimal, API_BASE_URL]);


    //////// CONST PARA BUSQUEDA RAPIDA


    const handleQueryNotificacionChange = (e) => {
        const newQuery = e.target.value;
        setQueryNotificacion(newQuery);
        debouncedFetchData(1, newQuery, searchMode);
    };

    // Función de manejo para "Buscar" convencional
    const handleQueryChange = (e) => {
        const newQuery = e.target.value;
        setQuery(newQuery);
        debouncedFetchData(1, newQuery, searchMode);
    };


    const fetchData = useCallback(async (pagina, queryTerm, isSearchMode) => {
        try {
            if (isSearchMode) {
                // Búsqueda avanzada: se envían "query" y "search_field"
                const resp = await axios.get(`${API_BASE_URL}/api/new_search`, {
                    params: {
                        query: queryTerm,
                        search_field: searchField,
                    },
                });
                setDatos(resp.data);
                setPage(1);
                setTotalPages(1);
                setTotalRecords(resp.data.length);
            } else {
                // Búsqueda convencional: se envían filtros adicionales
                const resp = await axios.get(`${API_BASE_URL}/api/buscar`, {
                    params: {
                        page: pagina,
                        query: queryTerm,
                        abogado: selectedAbogado,
                        mostrar_archivados: mostrarArchivados,
                    },
                });
                setDatos(resp.data.data);
                setPage(resp.data.page);
                setTotalPages(resp.data.total_pages);
                setTotalRecords(resp.data.total_records);
            }
        } catch (error) {
            console.error("Error en fetchData:", error);
        }
    }, [API_BASE_URL, searchField, selectedAbogado, mostrarArchivados]);

    const debouncedFetchData = useCallback(
        debounce((pagina, queryTerm, isSearchMode) => {
            fetchData(pagina, queryTerm, isSearchMode);
        }, 500),
        [fetchData]
    );

    useEffect(() => {
        if (isLoggedIn) {
            // Se elige la variable de búsqueda según el modo
            const currentQuery = searchMode ? queryNotificacion : query;
            debouncedFetchData(page, currentQuery, searchMode);
        }
    }, [isLoggedIn, page, queryNotificacion, query, searchMode, debouncedFetchData]);



    const performSearch = async () => {
        try {
            const response = await fetch(
                `/api/new_search?query=${encodeURIComponent(query)}&search_field=${encodeURIComponent(searchField)}`
            );
            const data = await response.json();
            if (response.ok) {
                setDatos(data);
            } else {
                console.error(data.error);
            }
        } catch (error) {
            console.error(error);
        }
    };



    //////// CONST PARA BUSQUEDA RAPIDA///////////////

    // ADICION NUEVA: useEffect para procesar pdfFiles y llenar datosMinimal
    useEffect(() => {
        if (pdfFiles.length > 0) {
            const fetchAll = async () => {
                console.log("[fetchAll] PDF files a procesar:", pdfFiles);

                const results = [];
                for (let file of pdfFiles) {
                    const fileName = file.name;
                    console.log("Procesando file =>", fileName);

                    // Busca en el nombre del PDF algo que coincida con tu regex (ej. 'D-123-2023')
                    const match = fileName.match(registroPPURegex);
                    if (match) {
                        const ppuExtracted = match[0].toUpperCase();
                        console.log(`Coincidencia con registro PPU => ${ppuExtracted}`);

                        try {
                            // Consulta a tu backend para buscar la fila en datapenal
                            const resp = await axios.get(`${API_BASE_URL}/api/buscar`, {
                                params: {
                                    query: ppuExtracted,
                                    limit: 1,
                                    page: 1,
                                    mostrar_archivados: true,
                                },
                            });
                            console.log(`[${fileName}] Respuesta /api/buscar =>`, resp.data);

                            if (resp.data.data && resp.data.data.length > 0) {
                                // Escoge la fila que coincida EXACTAMENTE o toma la primera
                                const exactMatch = resp.data.data.find(
                                    d => (d.registro_ppu || '').toUpperCase() === ppuExtracted
                                );
                                const row = exactMatch || resp.data.data[0];

                                // Siempre asigna fileName (para que el backend sepa qué PDF mover)
                                row.fileName = fileName;

                                // Inicializa valores clave para la tabla minimal
                                row.accion = '';
                                row.plazo_atencion = '';
                                row.fecha_atencion = '';
                                row.audiencia = false;

                                // (IMPORTANTE) Solo guarda la predicción en predictedFinal,
                                // no en e_situacional
                                if (useML && file.predicted) {
                                    row.predictedFinal = file.predicted;
                                    console.log(`[${fileName}] predictedFinal =>`, row.predictedFinal);

                                    // Aquí podrías llamar a un endpoint
                                    // que verifique si esa predicción ya existe en la BD.
                                    // Por ejemplo: /api/check_prediccion_en_situacional
                                    try {
                                        console.log("Enviando a /api/check_prediccion_en_situacional =>", {
                                            registro_ppu: row.registro_ppu,
                                            e_situacional: row.e_situacional,
                                            predicted_value: file.predicted
                                        });

                                        const respCheck = await axios.post(
                                            `${API_BASE_URL}/api/check_prediccion_en_situacional`,
                                            {
                                                registro_ppu: row.registro_ppu,         // si quieres mandarlo
                                                e_situacional: row.e_situacional,       // tu texto real guardado en la BD
                                                predicted_value: file.predicted         // la predicción del ML
                                            }
                                        );

                                        console.log("Respuesta de check_prediccion_en_situacional =>", respCheck.data);

                                        // Si "match_found" es true => isDuplicate = true
                                        row.isDuplicate = respCheck.data.match_found === true;
                                        console.log("isDuplicate =>", row.isDuplicate);
                                    } catch (errCheck) {
                                        console.error("Error al chequear duplicado:", errCheck);
                                        // Si hay error, por defecto no lo marcamos duplicado
                                        row.isDuplicate = false;
                                    }

                                } else {
                                    // Si no hay ML o no hay file.predicted, por defecto no es duplicado
                                    row.isDuplicate = false;
                                }

                                results.push(row);
                            } else {
                                console.log(`[${fileName}] No se encontró data para ${ppuExtracted}.`);
                            }
                        } catch (error) {
                            console.error(`Error al buscar registro PPU '${ppuExtracted}':`, error);
                        }
                    } else {
                        console.log(`El archivo "${fileName}" no hace match con el regex.`);
                    }
                }

                // Ordenar resultados (tu lógica actual de orden)
                const sortedResults = results.sort((a, b) => {
                    const re = /^(.*?)(-+)\.pdf$/i;
                    const suffixRe = /\s+-\s+cop(?:ia|ias)$/i;
                    const extractData = (fileName) => {
                        let name = fileName.toLowerCase().trim();
                        let dashCount = 0;
                        let hasSuffix = false;
                        const match = name.match(re);
                        if (match) {
                            name = match[1];
                            dashCount = match[2].length;
                        } else {
                            if (name.endsWith('.pdf')) {
                                name = name.slice(0, -4);
                            }
                        }
                        if (suffixRe.test(name)) {
                            hasSuffix = true;
                            name = name.replace(suffixRe, '').trim();
                        }
                        return { name, dashCount, hasSuffix };
                    };

                    const aData = extractData(a.fileName);
                    const bData = extractData(b.fileName);
                    const coll = new Intl.Collator(undefined, {
                        numeric: true,
                        sensitivity: 'base'
                    });

                    const nameComparison = coll.compare(aData.name, bData.name);
                    if (nameComparison !== 0) {
                        return nameComparison;
                    }
                    if (aData.hasSuffix && !bData.hasSuffix) {
                        return -1;
                    } else if (!aData.hasSuffix && bData.hasSuffix) {
                        return 1;
                    }
                    return aData.dashCount - bData.dashCount;
                });

                console.log("sortedResults =>", sortedResults);
                setDatosMinimal(prev => [...prev, ...sortedResults]);
                setMostrarTablaMinimal(true);
                setSelectedCell({ row: 0, col: 0 });

                // Limpia la lista original de pdfFiles
                setPdfFiles([]);
            };

            fetchAll();
        }
    }, [pdfFiles, API_BASE_URL, useML]);











    const [selectedCell, setSelectedCell] = useState({ row: 0, col: 0 });
    const [editingCell, setEditingCell] = useState(null);
    const [expandedCellOpen, setExpandedCellOpen] = useState(false);
    const [expandedCellContent, setExpandedCellContent] = useState('');

    const minimalStaticColumns = ['fileName', 'e_situacional', 'accion', 'plazo_atencion', 'fecha_atencion', 'ruta'];
    const registroPPURegex = /(D-\d{1,4}-\d{4}|LEG-\d{1,4}-\d{4}|L\.?\s?\d{1,4}-\d{4})/i;

    const columnsOrder = useMemo(() => {
        if (datosMinimal.length === 0) return [];
        const row = datosMinimal[0];
        const allKeys = Object.keys(row);
        const hiddenCols = [
            'id', 'last_modified', 'departamento', 'fecha_de_archivo', 'fecha_e_situacional',
            'fecha_ingreso', 'informe_juridico', 'item', 'denunciado', 'registro_ppu', 'delito',
            'abogado', 'juzgado', 'origen', 'nr de exp completo', 'hash_sha', 'seguimiento', 'audiencia',
            'etiqueta'
        ];
        const dynamicCols = allKeys.filter(k =>
            !hiddenCols.includes(k) &&
            !minimalStaticColumns.includes(k) &&
            k !== 'e_situacional' &&
            k !== 'fileName' &&
            k !== 'accion' &&
            k !== 'plazo_atencion' &&
            k !== 'fecha_atencion'
        );
        dynamicCols.sort();
        return [...minimalStaticColumns, ...dynamicCols];
    }, [datosMinimal]);



    const handleMinimalChange = useCallback((rowIndex, field, value) => {
        setDatosMinimal((prev) => {
            const updated = [...prev];
            updated[rowIndex] = { ...updated[rowIndex], [field]: value };
            return updated;
        });
    }, []);


    const limpiarTabla = async () => {
        const ppus = datosMinimal.map(fila => fila.registro_ppu); // Extrae todos los registro_ppu

        try {
            // Llamada al backend para eliminar PDFs asociados a todos los registro_ppu
            await axios.post(`${API_BASE_URL}/api/limpiar_pdfs_por_registros`, { ppus });

            // Si la eliminación fue exitosa, limpias el estado local
            setDatosMinimal([]);
            setCeldasEditadas({});
            setSelectedCell({ row: 0, col: 0 });
        } catch (error) {
            console.error("Error al limpiar PDFs:", error);
            alert("No se pudo limpiar los PDFs asociados.");
        }
    };


    const [isExpanded, setIsExpanded] = useState(false);

    const toggleExpand = () => {
        setIsExpanded(!isExpanded);
    };

    const retirarFila = async (rowIndex) => {
        const fila = datosMinimal[rowIndex];
        const registro_ppu = fila.registro_ppu; // Asegúrate de que este campo exista

        try {
            // Llamada al backend para eliminar PDFs asociados al registro_ppu
            await axios.post(`${API_BASE_URL}/api/eliminar_pdfs_por_registro`, { registro_ppu });

            // Si la eliminación fue exitosa, actualizas el estado local
            const updatedDatos = datosMinimal.filter((_, index) => index !== rowIndex);
            setDatosMinimal(updatedDatos);

            if (selectedCell.row >= updatedDatos.length) {
                setSelectedCell({ row: updatedDatos.length - 1, col: selectedCell.col });
            }
        } catch (error) {
            console.error("Error al eliminar PDFs:", error);
            alert("No se pudo eliminar los PDFs asociados.");
        }
    };


    const moveSelection = (newRow, newCol = selectedCell.col) => {
        const numRows = datosMinimal.length;
        if (numRows === 0) return;
        const cols = getColumnOrder(datosMinimal[0]);
        const numCols = cols.length;
        if (newRow < 0 || newRow >= numRows) return;
        if (newCol < 0 || newCol >= numCols) return;
        setSelectedCell({ row: newRow, col: newCol });
    };

    const handleCellKeyDown = (e, rowIndex, colIndex) => {
        const columns = vistaMinimal ? columnasMinimal : columnsOrder;
        const colName = columns[colIndex];
        const nonEditableCols = vistaMinimal ? [] : ['fileName', 'registro_ppu', 'fecha_ingreso', 'last_modified', 'ruta', 'hash_sha', 'seguimiento'];
        const datePickerCols = ['fecha_atencion'];
        const isDateField = (colName === 'fecha_ingreso' || colName === 'last_modified');
        const isRegistroPPU = (colName === 'registro_ppu');
        const editable = !nonEditableCols.includes(colName) && !isDateField && !isRegistroPPU && !datePickerCols.includes(colName);

        if (editingCell && editingCell.row === rowIndex && editingCell.col === colIndex) {
            if (e.key === 'Enter') {
                setEditingCell(null);
                setSelectedCell({ row: rowIndex, col: colIndex });
                e.preventDefault();
            }
            return;
        } else {
            switch (e.key) {
                case 'ArrowUp':
                    e.preventDefault();
                    moveSelection(rowIndex - 1, colIndex);
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    moveSelection(rowIndex + 1, colIndex);
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    moveSelection(rowIndex, colIndex - 1);
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    moveSelection(rowIndex, colIndex + 1);
                    break;
                case 'Enter':
                    if (datePickerCols.includes(colName)) {
                        e.preventDefault();
                    } else if (editable && !editingCell) {
                        const currentVal = datosMinimal[rowIndex][colName] || '';
                        setEditingCell({ row: rowIndex, col: colIndex, initialValue: currentVal });
                        e.preventDefault();
                    } else if (editingCell) {
                        setEditingCell(null);
                        e.preventDefault();
                    } else if (!editable) {
                        setExpandedCellContent(datosMinimal[rowIndex][colName] || '');
                        setExpandedCellOpen(true);
                        e.preventDefault();
                    }
                    break;
                default:
                    break;
            }
        }
    };
    // Estados adicionales para el tab 2
    const [queryPlazos, setQueryPlazos] = useState('');
    const [selectedAbogadoPlazos, setSelectedAbogadoPlazos] = useState('');
    const [mostrarArchivadosPlazos, setMostrarArchivadosPlazos] = useState(true);
    const [pagePlazos, setPagePlazos] = useState(1);
    const [totalPagesPlazos, setTotalPagesPlazos] = useState(1);
    const [totalRecordsPlazos, setTotalRecordsPlazos] = useState(0);

    // Función para buscar datos de plazos, con paginación, filtrado por abogado y archivados, y búsqueda
    const buscarPlazosData = useCallback(async (pagina, queryTerm, abogadoTerm, mostrarArch) => {
        try {
            const response = await axios.get(`${API_BASE_URL}/api/datapenal_plazos`, {
                params: {
                    page: pagina,
                    query: queryTerm,
                    abogado: procesarAbogado(abogadoTerm),
                    mostrar_archivados: mostrarArch
                }
            });
            const fetchedData = response.data.data;

            // Calcular dias_restantes para cada registro
            const updatedData = fetchedData.map(row => {
                let diasRestantesString = '';
                const plazoAtencion = row.plazo_atencion;

                if (!row.fecha_atencion || !plazoAtencion) {
                    diasRestantesString = 'N/A';
                } else {
                    // Determinar si plazo_atencion es un número (días) o una fecha completa
                    const plazoEsNumero = /^\d+$/.test(plazoAtencion);
                    if (plazoEsNumero) {
                        // Manejo cuando plazo_atencion es un número (días)
                        const fechaAtencionDate = new Date(row.fecha_atencion);
                        if (isNaN(fechaAtencionDate)) {
                            diasRestantesString = 'Fecha inválida';
                        } else {
                            const deadline = addBusinessDays(fechaAtencionDate, parseInt(plazoAtencion, 10));
                            const today = new Date();
                            const remainingDays = differenceInBusinessDays(deadline, today);
                            if (remainingDays < 0) {
                                diasRestantesString = 'Vencido';
                            } else if (remainingDays === 1) {
                                diasRestantesString = 'URGENTE RESOLVER EN EL DIA';
                            } else {
                                diasRestantesString = `${remainingDays} dias restantes`;
                            }
                        }
                    } else {
                        // Manejo cuando plazo_atencion es una fecha completa
                        try {
                            const [datePart, timePart] = plazoAtencion.split(' ');
                            const [day, month, year] = datePart.split('-').map(Number);
                            const [hour, minute] = timePart.split(':').map(Number);
                            const deadline = new Date(year, month - 1, day, hour, minute);
                            const now = new Date();
                            const diffMs = deadline - now;

                            if (diffMs < 0) {
                                diasRestantesString = 'Vencido';
                            } else {
                                const totalSegundos = Math.floor(diffMs / 1000);
                                const dias = Math.floor(totalSegundos / 86400);
                                let resto = totalSegundos % 86400;
                                const horas = Math.floor(resto / 3600);
                                resto = resto % 3600;
                                const minutos = Math.floor(resto / 60);

                                const partes = [];
                                if (dias > 0) partes.push(`${dias} DIAS`);
                                if (horas > 0) partes.push(`${horas} HORAS`);
                                if (minutos > 0) partes.push(`${minutos} MINUTOS`);

                                if (partes.length === 0) {
                                    partes.push("MENOS DE UN MINUTO");
                                }

                                diasRestantesString = `FALTA ${partes.join(' Y ')}`;
                            }
                        } catch (error) {
                            diasRestantesString = 'Formato inválido';
                        }
                    }
                }

                const normalized = diasRestantesString.trim().toLowerCase();

                let sortingValue;

                if (normalized === 'vencido') {
                    sortingValue = -3; // Mayor urgencia: vencido
                } else if (normalized === 'urgente resolver en el dia' || normalized === '0 dias restantes') {
                    sortingValue = -2; // Alta urgencia unificada para ambos casos
                    diasRestantesString = 'URGENTE RESOLVER EN EL DIA'; // Etiqueta unificada
                } else if (/^\d+\s*dias restantes$/.test(normalized)) {
                    const match = normalized.match(/^(\d+)\s*dias restantes$/);
                    sortingValue = match ? parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER; // Orden según días restantes
                } else if (/^falta.*(dias|horas|minutos)/i.test(normalized)) {
                    // Manejo de fechas completas con formato "FALTA X DIAS Y HORAS"
                    const diasMatch = normalized.match(/(\d+)\s*DIAS/i);
                    const horasMatch = normalized.match(/(\d+)\s*HORAS/i);
                    const minutosMatch = normalized.match(/(\d+)\s*MINUTOS/i);

                    const dias = diasMatch ? parseInt(diasMatch[1], 10) : 0;
                    const horas = horasMatch ? parseInt(horasMatch[1], 10) : 0;
                    const minutos = minutosMatch ? parseInt(minutosMatch[1], 10) : 0;

                    // Calcular un valor ponderado para fechas completas (días > horas > minutos)
                    sortingValue = dias + horas / 24 + minutos / 1440;
                } else {
                    sortingValue = Number.MAX_SAFE_INTEGER; // Sin urgencia o sin datos válidos
                }


                return {
                    ...row,
                    dias_restantes: diasRestantesString,
                    sortingValue
                };
            });

            setPlazosData(updatedData);
            setPagePlazos(response.data.page);
            setTotalPagesPlazos(response.data.total_pages);
            setTotalRecordsPlazos(response.data.total_records);
        } catch (error) {
            console.error("Error al obtener datos de plazos:", error);
            setErrorPlazos("No se pudo cargar la información de plazos.");
        } finally {
            setLoadingPlazos(false);
        }
    }, [API_BASE_URL]);

    // Debounce para búsqueda en tab 2
    const debouncedBuscarPlazosData = useCallback(
        debounce((pagina, queryTerm, abogadoTerm, mostrarArch) => {
            buscarPlazosData(pagina, queryTerm, abogadoTerm, mostrarArch);
        }, 500),
        [buscarPlazosData]
    );


    // Efecto para cargar datos cada vez que cambian parámetros de búsqueda, paginación o estado de login en tab 2
    useEffect(() => {
        if (isLoggedIn) {
            setLoadingPlazos(true);
            debouncedBuscarPlazosData(
                pagePlazos,
                queryPlazos,
                selectedAbogadoPlazos,
                mostrarArchivadosPlazos
            );
        }
    }, [
        isLoggedIn,
        pagePlazos,
        queryPlazos,
        selectedAbogadoPlazos,
        mostrarArchivadosPlazos,
        debouncedBuscarPlazosData
    ]);



    // Handler para cambio en el campo de búsqueda del tab 2
    const handleQueryPlazosChange = (e) => {
        const newQuery = e.target.value;
        setQueryPlazos(newQuery);
        // Reinicia a la primera página
        setPagePlazos(1);
        debouncedBuscarPlazosData(1, newQuery, selectedAbogadoPlazos, mostrarArchivadosPlazos);
    };

    // Handler para exportar a Excel en tab 2
    const exportarExcelPlazos = async () => {
        try {
            const params = {
                query: queryPlazos,
                abogado: selectedAbogadoPlazos,
                mostrar_archivados: mostrarArchivadosPlazos
            };

            const response = await axios.get(`${API_BASE_URL}/api/exportar_excel_plazos`, { // Asumiendo un endpoint distinto para plazos
                params,
                responseType: 'blob',
            });

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;

            const contentDisposition = response.headers['content-disposition'];
            let fileName = 'plazos_exportados.xlsx';
            if (contentDisposition) {
                const fileNameMatch = contentDisposition.match(/filename="(.+)"/);
                if (fileNameMatch && fileNameMatch.length === 2) {
                    fileName = fileNameMatch[1];
                }
            }

            link.setAttribute('download', fileName);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (error) {
            console.error("Error:", error);
            alert(`Error: ${error.response?.data?.error || error.message}`);
        }
    };



    useEffect(() => {
        if (!editingCell) {
            const cell = document.querySelector(`[data-cell="${selectedCell.row}-${selectedCell.col}"]`);
            if (cell) {
                cell.focus();
            }
        }
    }, [selectedCell, editingCell]);

    const getCellBackgroundColor = (rowIndex, colIndex, field) => {
        const key = `${rowIndex}-${field}`;
        if (celdasEditadas[key]) {
            return '#c8e6c9';
        }
        return colIndex % 2 === 0 ? '#e0f7fa' : '#f1f8e9';
    };

    const minimalStylesHeader = {
        padding: '2px 4px',
        fontSize: '10px',
        fontWeight: 'bold',
        whiteSpace: 'nowrap',
        wordBreak: 'normal',
        textAlign: 'center'
    };

    const minimalStylesCell = {
        padding: '4px 8px',
        fontSize: '12px',
        whiteSpace: 'normal',
        overflowX: 'auto',
        maxWidth: '300px',
        wordBreak: 'break-word',
        textAlign: 'left',
    };

    const eSituacionalStyle = {
        minWidth: '250px',
        maxWidth: '300px'
    };

    const onDrop = useCallback((acceptedFiles) => {
        // Acumula los nuevos archivos en el estado existente
        setPdfFiles((prevFiles) => [...prevFiles, ...acceptedFiles]);

        // Por cada archivo recibido, si ML está activado, llamar al endpoint predict_ml
        acceptedFiles.forEach(async (file) => {
            if (useML) {
                const formData = new FormData();
                formData.append('file', file);
                try {
                    const response = await axios.post(`${API_BASE_URL}/api/predict_ml`, formData, {
                        headers: { 'Content-Type': 'multipart/form-data' },
                    });
                    // Se guarda la predicción en el objeto file
                    file.predicted = response.data.predicted;
                    console.log(`Predicción para ${file.name}:`, response.data.predicted);
                } catch (err) {
                    console.error(`Error al procesar ML para ${file.name}:`, err);
                }
            }
            // Además, enviar el archivo al servidor (si es necesario)
            const formDataUpload = new FormData();
            formDataUpload.append('file', file);
            try {
                const response = await axios.post(`${API_BASE_URL}/upload`, formDataUpload, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });
                console.log(`Archivo ${file.name} subido con éxito:`, response.data);
            } catch (err) {
                console.error(`Error al subir ${file.name}:`, err);
            }
        });
    }, [API_BASE_URL, useML]);




    const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'application/pdf': [] } });

    const buscarDatos = useCallback(async (pagina, queryTerm) => {
    // Cancelar solicitud anterior si existe.
    if (cancelTokenSource) {
        cancelTokenSource.cancel('Cancelando solicitud previa');
    }
    // Crear nuevo token de cancelación para la solicitud actual.
    cancelTokenSource = CancelToken.source();

    try {
        const response = await axios.get(`${API_BASE_URL}/api/buscar`, {
            params: {
                page: pagina,
                query: queryTerm,
                abogado: procesarAbogado(selectedAbogado),
                mostrar_archivados: mostrarArchivados
            },
            cancelToken: cancelTokenSource.token, // Asocia el token a esta solicitud.
        });
        setDatos(response.data.data);
        setPage(response.data.page);
        setTotalPages(response.data.total_pages);
        setTotalRecords(response.data.total_records);
    } catch (error) {
        if (axios.isCancel(error)) {
            console.log("Solicitud cancelada:", error.message); // Controla cancelaciones.
        } else {
            console.error("Error:", error); // Maneja otros errores.
        }
    }
}, [API_BASE_URL, selectedAbogado, mostrarArchivados]);

    const debouncedBuscarDatos = useCallback(
        debounce((pagina, queryTerm) => {
            buscarDatos(pagina, queryTerm);
        }, 500),
        [buscarDatos]
    );



    useEffect(() => {
        if (isLoggedIn) {
            if (selectedAbogado || mostrarArchivados) {
                setPage(1); // Reinicia a la primera página si cambian los filtros
                buscarDatos(1, query); // Realiza la búsqueda en la página 1
            } else {
                buscarDatos(page, query); // Mantiene la página actual
            }
        }
    }, [isLoggedIn, page, query, selectedAbogado, mostrarArchivados, buscarDatos]);


    const handleLogin = async () => {
        try {
            const response = await axios.post(`${API_BASE_URL}/api/login`, {
                username,
                password
            });
            setIsLoggedIn(true);
            setRole(response.data.role);
            setUsername('');
            setPassword('');
            buscarDatos(1, query);
        } catch (error) {
            console.error("Error:", error);
            alert("Credenciales inválidas");
        }
    };

    const handleLogout = async () => {
        try {
            await axios.post(`${API_BASE_URL}/api/logout`);
            setIsLoggedIn(false);
            setRole('');
            setDatos([]);
            setDatosMinimal([]);
        } catch (error) {
            console.error("Error:", error);
        }
    };

    const obtenerRegistros = useCallback(async () => {
        try {
            const response = await axios.get(`${API_BASE_URL}/api/get_registros`, {
                params: {
                    tipo: tipoRegistro,
                    year: anioRegistro
                }
            });
            setRegistrosExistentes(response.data.data);
        } catch (error) {
            console.error("Error:", error);
        }
    }, [API_BASE_URL, tipoRegistro, anioRegistro]);

    useEffect(() => {
        if (openModal) {
            obtenerRegistros();
        }
    }, [openModal, obtenerRegistros]);

    const generarRegistroPPU = async () => {
        try {
            const data = {
                tipo: tipoRegistro,
                year: anioRegistro,
                caso_especial: casoEspecial,
            };
            if (casoEspecial) {
                data.numero = numeroManual;
                data.sufijo = sufijo;
            }
            const response = await axios.post(`${API_BASE_URL}/api/generar_registro`, data);
            setRegistroGenerado(response.data.registro_ppu);
            setNuevoCaso({ ...nuevoCaso, registro_ppu: response.data.registro_ppu });
        } catch (error) {
            console.error("Error:", error);
            alert(`Error: ${error.response?.data?.error || error.message}`);
        }
    };

    const validateExpediente = (campo, valor) => {
        let error = '';
        switch (campo) {
            case 'campo1':
                if (!/^\d{5}$/.test(valor)) {
                    error = 'Debe tener exactamente 5 dígitos.';
                }
                break;
            case 'campo2':
                {
                    const num2 = parseInt(valor, 10);
                    if (!/^\d{4}$/.test(valor) || isNaN(num2) || num2 < 1900 || num2 > 3000) {
                        error = 'Debe tener 4 dígitos entre 1900 y 3000.';
                    }
                }
                break;
            case 'campo3':
                if (!/^\d{1,3}$/.test(valor)) {
                    error = 'Debe tener entre 1 y 3 dígitos.';
                }
                break;
            case 'campo4':
                if (!/^\d{4}$/.test(valor)) {
                    error = 'Debe tener exactamente 4 dígitos.';
                }
                break;
            case 'campo5':
                if (!/^[A-Z]{2}$/.test(valor)) {
                    error = 'Debe tener exactamente 2 letras.';
                }
                break;
            case 'campo6':
                if (!/^[A-Z]{2}$/.test(valor)) {
                    error = 'Debe tener exactamente 2 letras.';
                }
                break;
            case 'campo7':
                if (!/^\d{1,2}$/.test(valor)) {
                    error = 'Debe tener entre 1 y 2 dígitos.';
                }
                break;
            default:
                break;
        }
        setErroresExpediente(prev => ({ ...prev, [campo]: error }));
    };

    const handleExpedienteChange = (campo, valor) => {
        setExpedienteJuzgado(prev => ({ ...prev, [campo]: valor }));
        validateExpediente(campo, valor);
    };

    const handleOrigenPasteExpediente = (e) => {
        const pastedData = e.clipboardData.getData('Text').trim();
        const parts = pastedData.split('-').map(part => part.trim());
        e.preventDefault();
        const newExpediente = { ...expedienteJuzgado };
        for (let i = 0; i < 7; i++) {
            const campoKey = `campo${i + 1}`;
            newExpediente[campoKey] = parts[i] || '';
            validateExpediente(campoKey, newExpediente[campoKey]);
        }
        setExpedienteJuzgado(newExpediente);
    };

    const agregarCaso = async () => {
        try {
            let origenValue = nuevoCaso.origen || '';
            if (mostrarExpedienteJuzgado) {
                const camposInvalidos = Object.values(erroresExpediente).filter(error => error !== '');
                if (camposInvalidos.length > 0) {
                    alert("Corrija los errores.");
                    return;
                }
                const camposVacios = Object.entries(expedienteJuzgado).filter(([_, value]) => !value.trim()).map(([key]) => key);
                if (camposVacios.length > 0) {
                    alert("Complete todos los campos.");
                    return;
                }
                if (/^\d/.test(origenValue)) {
                    origenValue = `CASO ${origenValue}`;
                }
            } else {
                if (/^\d/.test(origenValue)) {
                    origenValue = `CASO ${origenValue}`;
                }
            }

            const { item, ...dataToSend } = nuevoCaso;
            dataToSend.origen = origenValue;
            if (dataToSend.fiscalia && despachoNumber) {
                dataToSend.fiscalia = `${dataToSend.fiscalia} - ${despachoNumber} DESPACHO`;
            }
            if (tipoRegistro === 'LEGAJO') {
                delete dataToSend.informe_juridico;
            }
            if (tipoRegistro === 'DENUNCIA') {
                delete dataToSend.origen;
            }
            if (mostrarExpedienteJuzgado) {
                dataToSend.expediente_juzgado = expedienteJuzgado;
            }

            await axios.post(`${API_BASE_URL}/api/agregar`, dataToSend);
            alert("Caso agregado.");
            setNuevoCaso({
                abogado: '',
                registro_ppu: '',
                denunciado: '',
                origen: '',
                'nr de exp completo': '',
                delito: '',
                departamento: '',
                fiscalia: '',
                juzgado: '',
                informe_juridico: '',
                e_situacional: ''
            });
            setRegistroGenerado('');
            setOpenModal(false);
            setDespachoNumber('');
            setMostrarExpedienteJuzgado(false);
            setExpedienteJuzgado({
                campo1: '',
                campo2: '',
                campo3: '',
                campo4: '',
                campo5: '',
                campo6: '',
                campo7: ''
            });
            setErroresExpediente({});
            buscarDatos(1, query);
        } catch (error) {
            console.error("Error:", error);
            alert(`Error: ${error.response?.data?.error || error.message}`);
        }
    };

    const eliminarCaso = async () => {
        try {
            await axios.post(`${API_BASE_URL}/api/eliminar`, { registro_ppu: nuevoCaso.registro_ppu });
            alert("Caso eliminado.");
            setNuevoCaso({
                abogado: '',
                registro_ppu: '',
                denunciado: '',
                origen: '',
                'nr de exp completo': '',
                delito: '',
                departamento: '',
                fiscalia: '',
                juzgado: '',
                informe_juridico: '',
                e_situacional: ''
            });
            setRegistroGenerado('');
            setDespachoNumber('');
            buscarDatos(1, query);
        } catch (error) {
            console.error("Error:", error);
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


    const exportarExcel = async () => {
        try {
            // 1) Construimos los params base
            const params = {
                query,
                abogado: selectedAbogado,
                mostrar_archivados: mostrarArchivados,
            };

            // 2) Si estamos en "modo rango", agregamos ppu_inicio y ppu_fin
            if (isRangeSearchActive) {
                params.ppu_inicio = rangoPpuInicio;
                params.ppu_fin = rangoPpuFin;
            }

            // 3) Llamamos SIEMPRE a /api/exportar_excel
            const response = await axios.get(`${API_BASE_URL}/api/exportar_excel`, {
                params,
                responseType: 'blob',     // Excel vendrá como blob
                withCredentials: true,    // Si tu backend requiere las cookies de sesión
            });

            // 4) Procesamos el blob y extraemos el nombre sugerido (si viene en Content-Disposition)
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;

            const contentDisposition = response.headers['content-disposition'];
            let fileName = 'datos_exportados.xlsx';
            if (contentDisposition) {
                const fileNameMatch = contentDisposition.match(/filename="(.+)"/);
                if (fileNameMatch && fileNameMatch.length === 2) {
                    fileName = fileNameMatch[1];
                }
            }

            // 5) Forzamos la descarga en el navegador
            link.setAttribute('download', fileName);
            document.body.appendChild(link);
            link.click();
            link.remove();

        } catch (error) {
            console.error("Error al exportar Excel:", error);
            alert(`Error: ${error.response?.data?.error || error.message}`);
        }
    };


    const handleOpenHistorial = (registroPPU) => {
        setSelectedRegistroPPU(registroPPU);
        if (historialCache[registroPPU]) {
            // Si el historial ya fue precargado, lo usamos inmediatamente
            setHistorialData(historialCache[registroPPU]);
            setOpenHistorialMinimal(true);
        } else {
            // Fallback: si por alguna razón no está en el caché, hacemos la petición individual
            axios.get(`${API_BASE_URL}/api/historial`, { params: { registro_ppu: registroPPU } })
                .then(response => {
                    setHistorialData(response.data.historial);
                    setOpenHistorialMinimal(true);
                })
                .catch(error => {
                    console.error("Error al cargar historial:", error);
                    alert("No se pudo cargar el historial.");
                });
        }
    };


    const MinimalTableRow = React.memo(({
        row,
        rindex,
        columns,
        minimalStylesCell,
        getCellBackgroundColor,
        selectedCell,
        editingCell,
        setSelectedCell,
        setEditingCell,
        toggleAudiencia,
        renderCellContent,
        handleCellKeyDown
    }) => (
        <TableRow key={rindex} hover>
            {columns.map((col, cindex) => (
                <TableCell
                    key={cindex}
                    data-cell={`${rindex}-${cindex}`}
                    style={{
                        ...minimalStylesCell,
                        backgroundColor: getCellBackgroundColor(rindex, cindex, col),
                        border:
                            selectedCell.row === rindex && selectedCell.col === cindex
                                ? '2px solid #000'
                                : 'none',
                        minWidth: '25px',
                        maxWidth: '3000px',
                        overflow: 'hidden',
                    }}
                    tabIndex={0}
                    onClick={() => {
                        setSelectedCell({ row: rindex, col: cindex });
                        if (!(editingCell && editingCell.row === rindex && editingCell.col === cindex)) {
                            setEditingCell(null);
                        }
                    }}
                    onKeyDown={(e) => handleCellKeyDown(e, rindex, cindex)}
                >
                    {renderCellContent(row, col, rindex, cindex)}
                </TableCell>
            ))}
            {/* Columna para "Audiencia" */}
            <TableCell>
                <Button
                    variant={row.audiencia ? "contained" : "outlined"}
                    color="primary"
                    size="small"
                    onClick={() => toggleAudiencia(rindex)}
                    style={{ padding: '2px 6px' }}
                >
                    {row.audiencia ? "Audiencia" : "Marcar"}
                </Button>
            </TableCell>
        </TableRow>
    ));






    const handleCloseHistorial = () => {
        setOpenHistorial(false);
        setHistorialData([]);
    };

    const handleFiscaliaInputChange = (event, newInputValue) => {
        setNuevoCaso(prevCaso => ({ ...prevCaso, fiscalia: newInputValue }));
        fetchFiscaliasNuevoCaso(newInputValue);
    };

    // Función para alternar el estado de audiencia
    const toggleAudiencia = (rowIndex) => {
        const updatedDatos = [...datosMinimal];
        updatedDatos[rowIndex].audiencia = !updatedDatos[rowIndex].audiencia;

        if (!updatedDatos[rowIndex].audiencia) {
            // Si se desmarca audiencia, limpiar plazo_atencion
            updatedDatos[rowIndex].plazo_atencion = '';
        }

        setDatosMinimal(updatedDatos);
    };

    const fetchFiscaliasNuevoCaso = useCallback(
        debounce(async (inputValue) => {
            if (!inputValue) {
                setFiscaliaOptionsNuevoCaso([]);
                return;
            }
            try {
                const response = await axios.get(`${API_BASE_URL}/api/get_fiscalias`, {
                    params: { query: inputValue }
                });
                setFiscaliaOptionsNuevoCaso(response.data.data);
            } catch (error) {
                console.error("Error al obtener fiscalias para el nuevo caso:", error);
            }
        }, 500),
        [API_BASE_URL]
    );

    const handleFiscaliaChange = (event, newValue) => {
        if (newValue) {
            setNuevoCaso(prevCaso => ({
                ...prevCaso,
                fiscalia: newValue.fiscalia,
                departamento: newValue.departamento,
                'nr de exp completo': newValue.nr_de_exp_completo + '-',
            }));
        } else {
            setNuevoCaso(prevCaso => ({
                ...prevCaso,
                fiscalia: '',
                departamento: '',
                'nr de exp completo': '',
            }));
        }
    };

    useEffect(() => {
        const nrExp = nuevoCaso['nr de exp completo'];
        const origen = nuevoCaso.origen;
        if (nrExp.endsWith('-') && origen.includes('-')) {
            const origenParts = origen.split('-');
            if (origenParts.length >= 2) {
                const numeros2 = origenParts[1];
                const numeros1 = origenParts[0];
                const nrExpCompleto = nrExp + numeros2 + '-' + numeros1 + '-0';
                setNuevoCaso(prevCaso => ({ ...prevCaso, 'nr de exp completo': nrExpCompleto }));
            }
        }
    }, [nuevoCaso['nr de exp completo'], nuevoCaso.origen]);



    const actualizarMinimal = async () => {
        if (!validateDatos()) {
            return;
        }

        try {
            const data = { registros: datosMinimal };
            await axios.post(`${API_BASE_URL}/api/bulk_update`, data);
            alert("Actualización completada.");
            setMostrarTablaMinimal(false);
            setDatosMinimal([]);
            setCeldasEditadas({});

            // **Añadido: Refrescar los datos en la pestaña "Plazos y Acciones"**
            if((role === 'admin' ? tab === 2 : tab === 1) && isLoggedIn) {
                fetchPlazosData();
            }
        } catch (error) {
            console.error("Error:", error);
            alert(`Error: ${error.response?.data?.error || error.message}`);
        }
    };


    const renderCellContent = (row, col, rindex, cindex) => {
        // 1. Lógica existente para la columna "ruta"
        if (col === "ruta") {
            return (
                <Button
                    variant="contained"
                    size="small"
                    onClick={(e) => {
                        e.preventDefault();
                        const secureFilename = row.ruta || row.fileName;
                        if (!secureFilename) {
                            alert("No se encontró el nombre del archivo.");
                            return;
                        }
                        const url = `${API_BASE_URL}/api/descargar_pdf_minimal?filename=${encodeURIComponent(secureFilename)}`;
                        if (pdfWindowRef.current && !pdfWindowRef.current.closed) {
                            pdfWindowRef.current.location.href = url;
                            pdfWindowRef.current.focus();
                        } else {
                            pdfWindowRef.current = window.open(
                                url,
                                "pdfWindow",
                                "toolbar=no,location=no,status=no,menubar=no,scrollbars=yes,resizable=yes,width=800,height=600"
                            );
                        }
                    }}
                >
                    Abrir
                </Button>
            );
        }

        // 2. Verificar si esta fila está en modo edición
        const isEditingThisRow = editingRowId === row.registro_ppu;

        // Si la fila NO está en edición, simplemente muestra el valor tal cual
        if (!isEditingThisRow) {
            return <>{row[col] || ""}</>;
        }

        // 3. Cuando la fila SÍ está en edición, manejamos la lógica por rol
        if (role === "admin") {
            // a) Admin puede editar todos los campos
            return (
                <TextField
                    value={editedData[col] || ""}
                    onChange={(e) =>
                        setEditedData({ ...editedData, [col]: e.target.value })
                    }
                    variant="outlined"
                    size="small"
                    fullWidth
                />
            );
        } else if (role === "user") {
            // b) User solo puede editar 'etiqueta'
            if (col === "etiqueta") {
                return (
                    <TextField
                        value={editedData["etiqueta"] || ""}
                        onChange={(e) =>
                            setEditedData({ ...editedData, etiqueta: e.target.value })
                        }
                        variant="outlined"
                        size="small"
                        fullWidth
                    />
                );
            } else {
                // El resto de los campos se muestran en modo lectura
                return <>{row[col] || ""}</>;
            }
        }
        return <>{row[col] || ""}</>;





        // Resto de la función (sin cambios)
        const currentPlazo = row.plazo_atencion || '';
        const parsedPlazo = currentPlazo
            ? parse(currentPlazo, 'dd-MM-yyyy hh:mm a', new Date())
            : null;

        const currentDate = row.fecha_atencion || null;
        const parsedDate = currentDate
            ? parse(currentDate, 'dd-MM-yyyy', new Date())
            : null;

        const isSelected = selectedCell.row === rindex && selectedCell.col === cindex;
        const isEditingThisCell = editingCell && editingCell.row === rindex && editingCell.col === cindex;

        const cellKey = `${rindex}-${col}`;
        const wasEdited = celdasEditadas[cellKey];

        const cellStyle = {
            ...minimalStylesCell,
            backgroundColor: wasEdited ? '#DFF0D8' : getCellBackgroundColor(rindex, cindex, col),
            border: isSelected ? '2px solid #000' : 'none',
            cursor: 'pointer',
            padding: isEditingThisCell && col === 'plazo_atencion' && row.audiencia ? '5px' : undefined,
            width: isEditingThisCell && col === 'plazo_atencion' && row.audiencia ? '200px' : undefined,
        };

        const nonEditableCols = vistaMinimal ? [] : ['fileName', 'registro_ppu', 'fecha_ingreso', 'last_modified', 'ruta', 'hash_sha', 'seguimiento'];

        const checkPlazoYAccion = (rowData) => {
            const tienePlazo = rowData.plazo_atencion && rowData.plazo_atencion.trim() !== '';
            const tieneFechaAtencion = rowData.fecha_atencion && rowData.fecha_atencion.trim() !== '';
            const sinAccion = !rowData.accion || rowData.accion.trim() === '';
            if ((tienePlazo || tieneFechaAtencion) && sinAccion) {
                alert("Debe llenar la accion a tomar por abogado si va a especificar el plazo o fecha de accion en la fila, M. " + (rindex + 1));
            }
        };

        const finishEditingCell = (oldValue, newValue, field) => {
            setEditingCell(null);
            setSelectedCell({ row: rindex, col: cindex });
            if (oldValue !== newValue) {
                const cellKey = `${rindex}-${field}`;
                setCeldasEditadas(prev => ({ ...prev, [cellKey]: true }));
            }
            checkPlazoYAccion(row);
        };

        const handleCellClick = (e) => {
            e.stopPropagation();
            const editable = !nonEditableCols.includes(col);
            if (editingCell && (editingCell.row !== rindex || editingCell.col !== cindex)) {
                setEditingCell(null);
            }
            if (selectedCell.row === rindex && selectedCell.col === cindex) {
                if (editable && !isEditingThisCell) {
                    setEditingCell({ row: rindex, col: cindex });
                }
            } else {
                setSelectedCell({ row: rindex, col: cindex });
            }
        };

        const editable = !nonEditableCols.includes(col);

        return (
            <Box onClick={handleCellClick} style={cellStyle}>
                {(() => {
                    if (col === 'fecha_atencion') {
                        const currentDateValue = row.fecha_atencion ? row.fecha_atencion : null;
                        const parsedDateValue = currentDateValue ? new Date(currentDateValue) : null;

                        return (
                            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={es}>
                                <DesktopDatePicker
                                    inputFormat="dd-MM-yyyy"
                                    value={parsedDateValue}
                                    onChange={(date) => {
                                        const isoString = date ? date.toISOString() : '';
                                        const oldVal = row.fecha_atencion || '';
                                        handleMinimalChange(rindex, 'fecha_atencion', isoString);
                                        finishEditingCell(oldVal, isoString, 'fecha_atencion');
                                    }}
                                    renderInput={(params) => <TextField {...params} variant="standard" />}
                                />
                            </LocalizationProvider>
                        );
                    } else if (col === 'plazo_atencion') {
                        if (isEditingThisCell) {
                            if (row.audiencia) {
                                // Modo con audiencia: fecha, hora y AM/PM
                                const oldVal = row.plazo_atencion || '';
                                const plazoRegex = /^(0?[1-9]|[12][0-9]|3[01])-(0?[1-9]|1[0-2])-(\d{4})\s(0?[1-9]|1[0-2]):([0-5][0-9])\s(AM|PM)$/;
                                const cellIdentity = `${rindex}-${cindex}`;
                                const cellValues = editingValues[cellIdentity] || {
                                    editDate: '',
                                    editTime: '',
                                    editAmPm: '',
                                    activeSubField: 'date'
                                };

                                if (!editingValues[cellIdentity] && plazoRegex.test(row[col] || '')) {
                                    const match = (row[col] || '').match(plazoRegex);
                                    setEditingValues((prev) => ({
                                        ...prev,
                                        [cellIdentity]: {
                                            editDate: `${match[1]}-${match[2]}-${match[3]}`,
                                            editTime: `${match[4]}:${match[5]}`,
                                            editAmPm: match[6],
                                            activeSubField: 'date'
                                        },
                                    }));
                                }

                                const combinedValue = `${cellValues.editDate} ${cellValues.editTime} ${cellValues.editAmPm}`.trim();
                                const isValidFormat = plazoRegex.test(combinedValue);

                                const saveValue = () => {
                                    const cellVals = editingValues[cellIdentity] || { editDate: '', editTime: '', editAmPm: '', activeSubField: 'date' };
                                    const currentCombined = `${cellVals.editDate} ${cellVals.editTime} ${cellVals.editAmPm}`.trim();
                                    if (plazoRegex.test(currentCombined)) {
                                        handleMinimalChange(rindex, 'plazo_atencion', currentCombined.toUpperCase());
                                        finishEditingCell(oldVal, currentCombined.toUpperCase(), 'plazo_atencion');
                                    } else {
                                        alert('Formato inválido. Debe ser "dd-mm-yyyy hh:mm AM/PM".');
                                        setEditingCell(null);
                                        setSelectedCell({ row: rindex, col: cindex });
                                    }
                                };

                                const handleKeyDown = (e) => {
                                    if (e.key === 'Enter') {
                                        saveValue();
                                    }
                                };

                                // Función que autoinserta guiones mientras escribe la fecha
                                const formatDateInput = (value) => {
                                    let cleanedValue = value.replace(/\D/g, '');
                                    let formattedValue = '';
                                    if (cleanedValue.length > 0) {
                                        formattedValue = cleanedValue.slice(0, 2);
                                    }
                                    if (cleanedValue.length > 2) {
                                        formattedValue += '-' + cleanedValue.slice(2, 4);
                                    }
                                    if (cleanedValue.length > 4) {
                                        formattedValue += '-' + cleanedValue.slice(4, 8);
                                    }
                                    return formattedValue;
                                };

                                const handleDateChange = (e) => {
                                    const formattedValue = formatDateInput(e.target.value);
                                    setEditingValues((prev) => ({
                                        ...prev,
                                        [cellIdentity]: { ...cellValues, editDate: formattedValue }
                                    }));
                                    e.target.setSelectionRange(formattedValue.length, formattedValue.length);
                                };

                                const handleTimeChange = (e) => {
                                    let timeValue = e.target.value.replace(/\D/g, '');
                                    if (timeValue.length > 2) {
                                        timeValue = timeValue.slice(0, 2) + ':' + timeValue.slice(2, 4);
                                    }
                                    setEditingValues((prev) => ({
                                        ...prev,
                                        [cellIdentity]: { ...cellValues, editTime: timeValue }
                                    }));
                                };

                                const handleAmPmChange = (e) => {
                                    const value = e.target.value.toUpperCase();
                                    setEditingValues((prev) => ({
                                        ...prev,
                                        [cellIdentity]: { ...cellValues, editAmPm: value }
                                    }));
                                };

                                return (
                                    <Box display="flex" alignItems="center" gap={1}>
                                        <TextField
                                            value={cellValues.editDate}
                                            onChange={handleDateChange}
                                            onFocus={() => {
                                                if (cellValues.activeSubField !== 'date') {
                                                    setEditingValues((prev) => ({
                                                        ...prev,
                                                        [cellIdentity]: { ...cellValues, activeSubField: 'date' }
                                                    }));
                                                }
                                            }}
                                            variant="standard"
                                            placeholder="dd-mm-yyyy"
                                            inputProps={{ maxLength: 10 }}
                                            style={{ width: '120px' }}
                                            error={!isValidFormat}
                                            helperText={!isValidFormat ? 'Formato inválido' : ''}
                                            onKeyDown={handleKeyDown}
                                            autoFocus={cellValues.activeSubField === 'date'}
                                        />
                                        <TextField
                                            value={cellValues.editTime}
                                            onChange={handleTimeChange}
                                            onFocus={() => {
                                                if (cellValues.activeSubField !== 'time') {
                                                    setEditingValues((prev) => ({
                                                        ...prev,
                                                        [cellIdentity]: { ...cellValues, activeSubField: 'time' }
                                                    }));
                                                }
                                            }}
                                            variant="standard"
                                            placeholder="hh:mm"
                                            inputProps={{ maxLength: 5 }}
                                            style={{ width: '60px' }}
                                            error={!isValidFormat}
                                            helperText={!isValidFormat ? 'Formato inválido' : ''}
                                            onKeyDown={handleKeyDown}
                                            autoFocus={cellValues.activeSubField === 'time'}
                                        />
                                        <TextField
                                            value={cellValues.editAmPm}
                                            onChange={handleAmPmChange}
                                            onFocus={() => {
                                                if (cellValues.activeSubField !== 'ampm') {
                                                    setEditingValues((prev) => ({
                                                        ...prev,
                                                        [cellIdentity]: { ...cellValues, activeSubField: 'ampm' }
                                                    }));
                                                }
                                            }}
                                            variant="standard"
                                            placeholder="AM/PM"
                                            inputProps={{ maxLength: 2 }}
                                            style={{ width: '60px' }}
                                            error={!/^([AP])M$/.test(cellValues.editAmPm)}
                                            helperText={!/^([AP])M$/.test(cellValues.editAmPm) ? 'Formato inválido' : ''}
                                            onKeyDown={handleKeyDown}
                                            autoFocus={cellValues.activeSubField === 'ampm'}
                                        />
                                    </Box>
                                );
                            } else {
                                // Modo sin audiencia: se mantiene la lógica actual
                                const oldVal = row.plazo_atencion || '';
                                const [localValue, setLocalValue] = React.useState(oldVal);
                                const firstFocusRef = React.useRef(true);

                                const handleNumericChange = (e) => {
                                    const numericValue = e.target.value.replace(/\D/g, '');
                                    setLocalValue(numericValue);
                                };

                                return (
                                    <TextField
                                        value={localValue}
                                        onChange={handleNumericChange}
                                        size="small"
                                        variant="standard"
                                        fullWidth
                                        autoFocus
                                        inputProps={{
                                            inputMode: 'numeric',
                                            pattern: '[0-9]*',
                                        }}
                                        onFocus={(e) => {
                                            if (firstFocusRef.current) {
                                                e.target.select();
                                                firstFocusRef.current = false;
                                            }
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                handleMinimalChange(rindex, col, localValue);
                                                finishEditingCell(oldVal, localValue, 'plazo_atencion');
                                            } else if (e.key === 'ArrowUp') {
                                                setLocalValue((prev) => (prev ? `${parseInt(prev) + 1}` : '1'));
                                            } else if (e.key === 'ArrowDown') {
                                                setLocalValue((prev) => (prev && parseInt(prev) > 0 ? `${parseInt(prev) - 1}` : '0'));
                                            }
                                        }}
                                        onBlur={() => {
                                            handleMinimalChange(rindex, col, localValue);
                                            finishEditingCell(oldVal, localValue, 'plazo_atencion');
                                        }}
                                    />
                                );
                            }
                        } else {
                            return (
                                <Typography variant="body2" style={{ wordBreak: 'break-word' }}>
                                    {row[col] || ''}
                                </Typography>
                            );
                        }
                    }


                    else if (col === 'accion' || col === 'e_situacional') {
                        if (isEditingThisCell) {
                            // 1) Valor inicial antes de editar (useRef evita re-renders innecesarios)
                            const oldVal = React.useRef(row[col] || '');
                            const [localValue, setLocalValue] = React.useState(oldVal.current);

                            // 2) Ref para manejar la selección inicial del texto
                            const firstFocusRef = React.useRef(true);

                            // 3) Ref para evitar pérdida de foco
                            const inputRef = React.useRef(null);

                            // 4) Estado para saber si el usuario ya movió el cursor manualmente
                            const [cursorMoved, setCursorMoved] = React.useState(false);

                            const saveValue = () => {
                                handleMinimalChange(rindex, col, localValue);
                                finishEditingCell(oldVal.current, localValue, col);

                                // Mantener el foco después de "Enter"
                                setTimeout(() => {
                                    if (inputRef.current) {
                                        inputRef.current.focus();
                                    }
                                }, 0);
                            };

                            return (
                                <TextField
                                    inputRef={inputRef}
                                    value={localValue}
                                    onChange={(e) => {
                                        setLocalValue(e.target.value);
                                        setCursorMoved(true); // Indicar que el usuario movió el cursor manualmente
                                    }}
                                    size="small"
                                    variant="standard"
                                    fullWidth
                                    multiline={col === 'e_situacional'} // Solo 'e_situacional' es multilínea
                                    rows={col === 'e_situacional' ? 4 : 1}
                                    autoFocus
                                    onFocus={(e) => {
                                        if (firstFocusRef.current && !cursorMoved) {
                                            e.target.select(); // Solo la primera vez selecciona todo
                                            firstFocusRef.current = false;
                                        }
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            saveValue();
                                        }
                                    }}
                                    onBlur={() => {
                                        setTimeout(() => {
                                            if (document.activeElement !== inputRef.current) {
                                                saveValue();
                                            }
                                        }, 100);
                                    }}
                                    style={{
                                        minWidth: col === 'accion' ? '150px' : '100%',
                                        width: col === 'accion' ? '150px' : '100%',
                                    }}
                                />
                            );
                        } else {
                            // Modo de visualización (no edición)
                            const displayValue = row[col] || '';
                            const style = {
                                wordBreak: 'break-word',
                                backgroundColor: 'inherit',
                                color: 'inherit',
                                flexGrow: 1,
                            };

                            return (
                                <Box display="flex" alignItems="center">
                                    <Typography variant="body2" style={style}>
                                        {displayValue}
                                    </Typography>
                                    {col === 'e_situacional' && historialCache[row.registro_ppu]?.length > 0 && (
                                        <IconButton
                                            size="small"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleOpenHistorial(row.registro_ppu);
                                            }}
                                            title="Ver historial"
                                            sx={{ p: 0.5 }}
                                        >
                                            <HistoryIcon style={{ fontSize: '16px' }} />
                                        </IconButton>
                                    )}
                                </Box>
                            );
                        }
                    }







                     else if (col === 'fiscalia') {
                        if (isEditingThisCell) {
                            const oldVal = row.fiscalia || '';
                            return (
                                <FiscaliaAutocomplete
                                    row={row}
                                    col={col}
                                    rindex={rindex}
                                    cindex={cindex}
                                    inputValues={inputValues}
                                    setInputValues={setInputValues}
                                    fiscaliaOptionsTable={fiscaliaOptionsTable}
                                    fetchFiscaliasTable={fetchFiscaliasTable}
                                    handleMinimalChange={handleMinimalChange}
                                    setEditingCell={setEditingCell}
                                    editingCell={editingCell}
                                    onFinishEditing={(newVal) => finishEditingCell(oldVal, newVal, 'fiscalia')}
                                />
                            );
                        } else {
                            return (
                                <Typography variant="body2" style={{ wordBreak: 'break-word' }}>
                                    {row[col] || ''}
                                </Typography>
                            );
                        }
                    } else if (col === 'fileName') {
                        return (
                            <Typography variant="body2" style={{ wordBreak: 'break-word' }}>
                                {row[col] || ''}
                            </Typography>
                        );
                    } else {
                        if (isEditingThisCell && editable) {
                            const oldVal = row[col] || '';
                            const [localValue, setLocalValue] = React.useState(oldVal);
                            const firstFocusRef = React.useRef(true);

                            return (
                                <TextField
                                    value={localValue}
                                    onChange={(e) => setLocalValue(e.target.value)}
                                    size="small"
                                    variant="standard"
                                    fullWidth
                                    autoFocus
                                    onFocus={(e) => {
                                        if (firstFocusRef.current) {
                                            e.target.select();
                                            firstFocusRef.current = false;
                                        }
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleMinimalChange(rindex, col, localValue);
                                            finishEditingCell(oldVal, localValue, col);
                                        }
                                    }}
                                    onBlur={() => {
                                        handleMinimalChange(rindex, col, localValue);
                                        finishEditingCell(oldVal, localValue, col);
                                    }}
                                />
                            );
                        } else {
                            return (
                                <Typography variant="body2" style={{ wordBreak: 'break-word' }}>
                                    {row[col] || ''}
                                </Typography>
                            );
                        }
                    }
                })()}
            </Box>
        );
    };


    return (
        <div style={{ padding: '20px' }}>
            <AppBar position="static" style={{ marginBottom: '20px' }}>
                <Toolbar>
                    <Typography variant="h6" style={{ flexGrow: 1 }}>
                        Sistema de Gestion de Casos
                    </Typography>
                    {isLoggedIn && (
                        <Button color="inherit" onClick={handleLogout}>
                            Cerrar Sesión
                        </Button>
                    )}
                </Toolbar>
            </AppBar>

            {/* Modal para subir seguimiento */}
            <Modal open={openSeguimientoModal} onClose={handleCloseSeguimientoModal}>
                <Box
                    sx={{
                        position: "absolute",
                        top: "50%",
                        left: "50%",
                        transform: "translate(-50%, -50%)",
                        width: 500,
                        bgcolor: "background.paper",
                        border: "2px solid #000",
                        boxShadow: 24,
                        p: 4,
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                    }}
                >
                    <Typography variant="h6">Subir Seguimiento</Typography>
                    {rowSeguimiento && (
                        <Typography>
                            {/* Mostrar información de la tabla activa */}
                            Origen: {activeTable === "plazos_acciones" ? "Plazos y Acciones" : "Plazos Vencidos"}
                            <br />
                            Abogado: {rowSeguimiento.abogado}
                            <br />
                            Registro PPU: {rowSeguimiento.registro_ppu}
                            <br />
                            Caso: {rowSeguimiento.origen || "NOCASO"}
                        </Typography>
                    )}

                    <Button variant="contained" component="label">
                        Seleccionar PDF
                        <input
                            type="file"
                            hidden
                            accept="application/pdf"
                            onChange={handlePDFUploadChange}
                        />
                    </Button>
                    {seguimientoPDF && <Typography>Archivo: {seguimientoPDF.name}</Typography>}

                    <Box display="flex" justifyContent="space-between" mt={2}>
                        <Button
                            variant="contained"
                            color="error"
                            onClick={handleCloseSeguimientoModal}
                        >
                            Cancelar
                        </Button>
                        <Button
                            variant="contained"
                            color="primary"
                            onClick={handleGuardarSeguimiento}
                        >
                            Guardar
                        </Button>
                    </Box>
                </Box>
            </Modal>

            {!isLoggedIn ? (
                <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
                    <Paper elevation={3} style={{ padding: '40px', maxWidth: '400px', width: '100%' }}>
                        <Typography variant="h5" align="center" gutterBottom>
                            Iniciar Sesión
                        </Typography>
                        <TextField
                            label="Usuario"
                            variant="outlined"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            fullWidth
                            margin="normal"
                        />
                        <TextField
                            label="Contraseña"
                            variant="outlined"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            fullWidth
                            margin="normal"
                        />
                        <Button variant="contained" color="primary" onClick={handleLogin} fullWidth style={{ marginTop: '20px' }}>
                            Iniciar Sesión
                        </Button>
                    </Paper>
                </Box>
            ) : (
                <>
                        <Tabs
                            value={tab}
                            onChange={(e, newValue) => setTab(newValue)}
                            aria-label="tabs"
                            style={{ marginBottom: '20px' }}
                        >
                            <Tab label="Actualizacion de Situacion" />
                            {role === 'user' && <Tab label="Notificaciones" />}
                            {((role === 'admin') || (Array.isArray(role) && role.includes('coordinador'))) && <Tab label="Consulta" />}
                            {role === 'admin' && <Tab label="Resumen Minimalista" />}
                            <Tab label="Plazos y Acciones" />
                            <Tab label="Plazos Vencidos" />
                        </Tabs>

                        {((role === 'admin') || (Array.isArray(role) && role.includes('coordinador'))) && tab === 1 && isLoggedIn && (
                            <Consulta />
                        )}

                        {role === 'user' && tab === 1 && (
                            <Box>
                                <Notifications />
                            </Box>
                        )}



                        {tab === 0 && (
                            <>
                                {/* Modo Búsqueda y encabezados */}
                                <Box mb={2} display="flex" alignItems="center">
                                    <Button
                                        variant="contained"
                                        color="info"
                                        onClick={() => setSearchMode(!searchMode)}
                                    >
                                        {searchMode ? "Mostrar Todo" : "Modo Búsqueda"}
                                    </Button>
                                    {searchMode && (
                                        <>
                                            <TextField
                                                label="Buscar Notificación"
                                                variant="outlined"
                                                value={queryNotificacion}
                                                onChange={handleQueryNotificacionChange}
                                                fullWidth
                                                sx={{ ml: 2 }}
                                            />
                                            <FormControl variant="outlined" sx={{ ml: 2, minWidth: 150 }}>
                                                <InputLabel id="search-field-label">Campo de Búsqueda</InputLabel>
                                                <Select
                                                    labelId="search-field-label"
                                                    value={searchField}
                                                    onChange={(e) => setSearchField(e.target.value)}
                                                    label="Campo de Búsqueda"
                                                >
                                                    <MenuItem value="legajo">Legajo</MenuItem>
                                                    <MenuItem value="casoFiscalCompleto">Caso Fiscal Completo</MenuItem>
                                                    <MenuItem value="casoJudicial">Caso Judicial</MenuItem>
                                                    <MenuItem value="denunciado">Denunciado</MenuItem>
                                                </Select>
                                            </FormControl>
                                        </>
                                    )}
                                </Box>
                                {searchMode && queryNotificacion.trim() === "" ? (
                                    <Typography variant="body1" align="center">
                                        Ingrese un criterio de búsqueda para mostrar resultados.
                                    </Typography>
                                ) : (
                                    <>
                                        {/* Sección de filtros y acciones */}
                                        <Box mb={2}>
                                            <Grid container spacing={2} alignItems="center">
                                                <Grid item xs={12} md={4}>
                                                    <TextField
                                                        label="Buscar"
                                                        variant="outlined"
                                                        value={query}
                                                        onChange={handleQueryChange}
                                                        fullWidth
                                                    />
                                                </Grid>
                                                <Grid item xs={12} md={2}>
                                                    <Button
                                                        variant="contained"
                                                        color="secondary"
                                                        onClick={() => setOpenRangoModal(true)}
                                                        fullWidth
                                                    >
                                                        Buscar por Rango
                                                    </Button>
                                                </Grid>
                                                <Modal open={openRangoModal} onClose={() => setOpenRangoModal(false)}>
                                                    <Box sx={modalStyle}>
                                                        <Typography variant="h6">Buscar por Rango de PPU</Typography>
                                                        <TextField
                                                            label="PPU Inicio"
                                                            value={rangoPpuInicio}
                                                            onChange={(e) => setRangoPpuInicio(e.target.value)}
                                                            fullWidth
                                                            margin="normal"
                                                        />
                                                        <TextField
                                                            label="PPU Fin"
                                                            value={rangoPpuFin}
                                                            onChange={(e) => setRangoPpuFin(e.target.value)}
                                                            fullWidth
                                                            margin="normal"
                                                        />
                                                        <Button variant="contained" onClick={handleBuscarPorRango}>
                                                            Buscar
                                                        </Button>
                                                    </Box>
                                                </Modal>
                                                <Grid item xs={12} md={3}>
                                                    {role === "admin" ? (
                                                        <FormControl variant="outlined" fullWidth>
                                                            <InputLabel id="filter-lawyer-label">
                                                                Filtrar por abogado
                                                            </InputLabel>
                                                            <Select
                                                                labelId="filter-lawyer-label"
                                                                value={selectedAbogado}
                                                                onChange={(e) => setSelectedAbogado(e.target.value)}
                                                                label="Filtrar por abogado"
                                                            >
                                                                <MenuItem value="">
                                                                    <em>Ninguno</em>
                                                                </MenuItem>
                                                                <MenuItem value="CUBA">CUBA</MenuItem>
                                                                <MenuItem value="AGUILAR">AGUILAR</MenuItem>
                                                                <MenuItem value="POLO">POLO</MenuItem>
                                                                <MenuItem value="MAU">MAU</MenuItem>
                                                                <MenuItem value="ASCURRA">ASCURRA</MenuItem>
                                                                <MenuItem value="FLORES">FLORES</MenuItem>
                                                                <MenuItem value="MARTINEZ">MARTINEZ</MenuItem>
                                                                <MenuItem value="PALACIOS">PALACIOS</MenuItem>
                                                                <MenuItem value="POMAR">POMAR</MenuItem>
                                                                <MenuItem value="ROJAS">ROJAS</MenuItem>
                                                                <MenuItem value="FRISANCHO">FRISANCHO</MenuItem>
                                                                <MenuItem value="NAVARRO">NAVARRO</MenuItem>
                                                            </Select>
                                                        </FormControl>
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
                                                                onChange={(e) => setMostrarArchivados(e.target.checked)}
                                                                color="primary"
                                                            />
                                                        }
                                                        label="¿Mostrar archivados?"
                                                    />
                                                </Grid>
                                                <Grid item xs={12} md={3}>
                                                    <Button
                                                        variant="contained"
                                                        color="success"
                                                        onClick={exportarExcel}
                                                        fullWidth
                                                        sx={{ height: 56 }}
                                                    >
                                                        Exportar Excel
                                                    </Button>
                                                </Grid>
                                                <Grid item xs={12} md={12}>
                                                    <Button
                                                        variant="contained"
                                                        color="primary"
                                                        onClick={() => setOpenModal(true)}
                                                        disabled={role === "user"}
                                                        fullWidth
                                                    >
                                                        Ingresar Nuevo Caso
                                                    </Button>
                                                </Grid>
                                            </Grid>
                                        </Box>
                                        <Box mb={2}>
                                            <Typography variant="h6" component="div">
                                                Total de Procesos: {totalRecords}
                                            </Typography>
                                        </Box>
                                        {/* Modal para Nuevo Caso */}
                                        <Modal open={openModal} onClose={() => setOpenModal(false)}>
                                            <Box
                                                sx={{
                                                    position: "absolute",
                                                    top: "50%",
                                                    left: "50%",
                                                    transform: "translate(-50%, -50%)",
                                                    width: 800,
                                                    bgcolor: "background.paper",
                                                    border: "2px solid #000",
                                                    boxShadow: 24,
                                                    p: 4,
                                                    display: "flex",
                                                    flexDirection: "column",
                                                    gap: 2,
                                                    maxHeight: "90vh",
                                                    overflowY: "auto"
                                                }}
                                            >
                                                <Typography variant="h6" component="h2">
                                                    Crear Registro PPU
                                                </Typography>
                                                <FormControl fullWidth>
                                                    <InputLabel>Tipo de Registro</InputLabel>
                                                    <Select
                                                        value={tipoRegistro}
                                                        label="Tipo de Registro"
                                                        onChange={(e) => {
                                                            setTipoRegistro(e.target.value);
                                                            setMostrarExpedienteJuzgado(false);
                                                            setExpedienteJuzgado({
                                                                campo1: "",
                                                                campo2: "",
                                                                campo3: "",
                                                                campo4: "",
                                                                campo5: "",
                                                                campo6: "",
                                                                campo7: ""
                                                            });
                                                            setErroresExpediente({});
                                                        }}
                                                    >
                                                        <MenuItem value="LEGAJO">LEGAJO</MenuItem>
                                                        <MenuItem value="DENUNCIA">DENUNCIA</MenuItem>
                                                    </Select>
                                                </FormControl>
                                                <TextField
                                                    label="Año de Registro"
                                                    variant="outlined"
                                                    value={anioRegistro}
                                                    onChange={(e) => setAnioRegistro(e.target.value)}
                                                    fullWidth
                                                />
                                                <FormControlLabel
                                                    control={
                                                        <Checkbox
                                                            checked={casoEspecial}
                                                            onChange={(e) => setCasoEspecial(e.target.checked)}
                                                        />
                                                    }
                                                    label="¿Caso especial?"
                                                />
                                                {casoEspecial && (
                                                    <>
                                                        <TextField
                                                            label="Número"
                                                            variant="outlined"
                                                            value={numeroManual}
                                                            onChange={(e) => setNumeroManual(e.target.value)}
                                                            fullWidth
                                                        />
                                                        <TextField
                                                            label="Sufijo"
                                                            variant="outlined"
                                                            value={sufijo}
                                                            onChange={(e) => setSufijo(e.target.value)}
                                                            fullWidth
                                                        />
                                                    </>
                                                )}
                                                <Button variant="contained" onClick={generarRegistroPPU} fullWidth>
                                                    Generar Registro PPU
                                                </Button>
                                                <Typography variant="subtitle1">Registros Existentes</Typography>
                                                <ul style={{ maxHeight: "200px", overflowY: "auto" }}>
                                                    {registrosExistentes.map((reg, index) => (
                                                        <li key={index}>{reg}</li>
                                                    ))}
                                                </ul>
                                                {registroGenerado && (
                                                    <>
                                                        <Typography variant="h6">
                                                            Registro PPU Generado: {registroGenerado}
                                                        </Typography>
                                                        <Typography variant="subtitle1">
                                                            Completar Datos del Nuevo Caso
                                                        </Typography>
                                                        <TextField
                                                            label="ABOGADO"
                                                            variant="outlined"
                                                            value={nuevoCaso.abogado}
                                                            onChange={(e) =>
                                                                setNuevoCaso((prevCaso) => ({
                                                                    ...prevCaso,
                                                                    abogado: e.target.value
                                                                }))
                                                            }
                                                            fullWidth
                                                        />
                                                        <TextField
                                                            label="REGISTRO PPU"
                                                            variant="outlined"
                                                            value={nuevoCaso["registro_ppu"]}
                                                            disabled
                                                            fullWidth
                                                        />
                                                        <TextField
                                                            label="DENUNCIADO"
                                                            variant="outlined"
                                                            value={nuevoCaso.denunciado}
                                                            onChange={(e) =>
                                                                setNuevoCaso((prevCaso) => ({
                                                                    ...prevCaso,
                                                                    denunciado: e.target.value
                                                                }))
                                                            }
                                                            fullWidth
                                                        />
                                                        {tipoRegistro === "LEGAJO" && (
                                                            <TextField
                                                                label="CASO FISCAL CORTO"
                                                                variant="outlined"
                                                                value={nuevoCaso.origen}
                                                                onChange={(e) => {
                                                                    const value = e.target.value;
                                                                    if (/[^0-9-]/.test(value)) {
                                                                        alert("Error, solo ingresar números y guiones");
                                                                        return;
                                                                    }
                                                                    setNuevoCaso((prevCaso) => ({ ...prevCaso, origen: value }));
                                                                }}
                                                                fullWidth
                                                            />
                                                        )}
                                                        {tipoRegistro === "LEGAJO" && (
                                                            <FormControlLabel
                                                                control={
                                                                    <Checkbox
                                                                        checked={mostrarExpedienteJuzgado}
                                                                        onChange={(e) => setMostrarExpedienteJuzgado(e.target.checked)}
                                                                    />
                                                                }
                                                                label="Marcar si hay expediente en juzgado"
                                                            />
                                                        )}
                                                        {tipoRegistro === "LEGAJO" && mostrarExpedienteJuzgado && (
                                                            <Box sx={{ mt: 2 }}>
                                                                <Typography variant="subtitle1">Expediente en Juzgado</Typography>
                                                                <Grid container spacing={2} alignItems="center">
                                                                    <Grid item xs={12} sm={6} md={2}>
                                                                        <TextField
                                                                            label="Campo 1"
                                                                            variant="outlined"
                                                                            value={expedienteJuzgado.campo1}
                                                                            onChange={(e) => handleExpedienteChange("campo1", e.target.value)}
                                                                            inputProps={{ maxLength: 5 }}
                                                                            error={!!erroresExpediente.campo1}
                                                                            helperText={erroresExpediente.campo1}
                                                                            onPaste={handleOrigenPasteExpediente}
                                                                            fullWidth
                                                                        />
                                                                    </Grid>
                                                                    <Grid item xs={12} sm={6} md={2}>
                                                                        <TextField
                                                                            label="Campo 2"
                                                                            variant="outlined"
                                                                            value={expedienteJuzgado.campo2}
                                                                            onChange={(e) => handleExpedienteChange("campo2", e.target.value)}
                                                                            inputProps={{ maxLength: 4 }}
                                                                            error={!!erroresExpediente.campo2}
                                                                            helperText={erroresExpediente.campo2}
                                                                            onPaste={handleOrigenPasteExpediente}
                                                                            fullWidth
                                                                        />
                                                                    </Grid>
                                                                    <Grid item xs={12} sm={6} md={2}>
                                                                        <TextField
                                                                            label="Campo 3"
                                                                            variant="outlined"
                                                                            value={expedienteJuzgado.campo3}
                                                                            onChange={(e) => handleExpedienteChange("campo3", e.target.value)}
                                                                            inputProps={{ maxLength: 3 }}
                                                                            error={!!erroresExpediente.campo3}
                                                                            helperText={erroresExpediente.campo3}
                                                                            onPaste={handleOrigenPasteExpediente}
                                                                            fullWidth
                                                                        />
                                                                    </Grid>
                                                                    <Grid item xs={12} sm={6} md={2}>
                                                                        <TextField
                                                                            label="Campo 4"
                                                                            variant="outlined"
                                                                            value={expedienteJuzgado.campo4}
                                                                            onChange={(e) => handleExpedienteChange("campo4", e.target.value)}
                                                                            inputProps={{ maxLength: 4 }}
                                                                            error={!!erroresExpediente.campo4}
                                                                            helperText={erroresExpediente.campo4}
                                                                            onPaste={handleOrigenPasteExpediente}
                                                                            fullWidth
                                                                        />
                                                                    </Grid>
                                                                    <Grid item xs={12} sm={6} md={1}>
                                                                        <TextField
                                                                            label="Campo 5"
                                                                            variant="outlined"
                                                                            value={expedienteJuzgado.campo5}
                                                                            onChange={(e) =>
                                                                                handleExpedienteChange("campo5", e.target.value.toUpperCase())
                                                                            }
                                                                            inputProps={{ maxLength: 2 }}
                                                                            error={!!erroresExpediente.campo5}
                                                                            helperText={erroresExpediente.campo5}
                                                                            onPaste={handleOrigenPasteExpediente}
                                                                            fullWidth
                                                                        />
                                                                    </Grid>
                                                                    <Grid item xs={12} sm={6} md={1}>
                                                                        <TextField
                                                                            label="Campo 6"
                                                                            variant="outlined"
                                                                            value={expedienteJuzgado.campo6}
                                                                            onChange={(e) =>
                                                                                handleExpedienteChange("campo6", e.target.value.toUpperCase())
                                                                            }
                                                                            inputProps={{ maxLength: 2 }}
                                                                            error={!!erroresExpediente.campo6}
                                                                            helperText={erroresExpediente.campo6}
                                                                            onPaste={handleOrigenPasteExpediente}
                                                                            fullWidth
                                                                        />
                                                                    </Grid>
                                                                    <Grid item xs={12} sm={6} md={1}>
                                                                        <TextField
                                                                            label="Campo 7"
                                                                            variant="outlined"
                                                                            value={expedienteJuzgado.campo7}
                                                                            onChange={(e) => handleExpedienteChange("campo7", e.target.value)}
                                                                            inputProps={{ maxLength: 2 }}
                                                                            error={!!erroresExpediente.campo7}
                                                                            helperText={erroresExpediente.campo7}
                                                                            onPaste={handleOrigenPasteExpediente}
                                                                            fullWidth
                                                                        />
                                                                    </Grid>
                                                                </Grid>
                                                            </Box>
                                                        )}
                                                        <TextField
                                                            label="DELITO"
                                                            variant="outlined"
                                                            value={nuevoCaso.delito}
                                                            onChange={(e) =>
                                                                setNuevoCaso((prevCaso) => ({
                                                                    ...prevCaso,
                                                                    delito: e.target.value
                                                                }))
                                                            }
                                                            fullWidth
                                                        />
                                                        <Autocomplete
                                                            options={fiscaliaOptionsNuevoCaso}
                                                            getOptionLabel={(option) => option.fiscalia}
                                                            onInputChange={handleFiscaliaInputChange}
                                                            onChange={handleFiscaliaChange}
                                                            inputValue={nuevoCaso.fiscalia}
                                                            renderInput={(params) => (
                                                                <TextField {...params} label="FISCALIA" variant="outlined" />
                                                            )}
                                                            fullWidth
                                                        />
                                                        <TextField
                                                            label="JUZGADO"
                                                            variant="outlined"
                                                            value={nuevoCaso.juzgado}
                                                            onChange={(e) =>
                                                                setNuevoCaso((prevCaso) => ({
                                                                    ...prevCaso,
                                                                    juzgado: e.target.value
                                                                }))
                                                            }
                                                            fullWidth
                                                        />
                                                        {nuevoCaso.fiscalia && (
                                                            <TextField
                                                                label="DIGITE NUMERO DE DESPACHO"
                                                                variant="outlined"
                                                                value={despachoNumber}
                                                                onChange={(e) => setDespachoNumber(e.target.value)}
                                                                fullWidth
                                                            />
                                                        )}
                                                        <TextField
                                                            label="DEPARTAMENTO"
                                                            variant="outlined"
                                                            value={nuevoCaso.departamento}
                                                            onChange={(e) =>
                                                                setNuevoCaso((prevCaso) => ({
                                                                    ...prevCaso,
                                                                    departamento: e.target.value
                                                                }))
                                                            }
                                                            fullWidth
                                                        />
                                                        <TextField
                                                            label="CASO FISCAL COMPLETO"
                                                            variant="outlined"
                                                            value={nuevoCaso["nr de exp completo"]}
                                                            onChange={(e) =>
                                                                setNuevoCaso((prevCaso) => ({
                                                                    ...prevCaso,
                                                                    "nr de exp completo": e.target.value
                                                                }))
                                                            }
                                                            fullWidth
                                                        />
                                                        {tipoRegistro === "DENUNCIA" && (
                                                            <TextField
                                                                label="INFORME JURIDICO"
                                                                variant="outlined"
                                                                value={nuevoCaso.informe_juridico}
                                                                onChange={(e) =>
                                                                    setNuevoCaso((prevCaso) => ({
                                                                        ...prevCaso,
                                                                        informe_juridico: e.target.value
                                                                    }))
                                                                }
                                                                fullWidth
                                                            />
                                                        )}
                                                        <TextField
                                                            label="SITUACION"
                                                            variant="outlined"
                                                            value={nuevoCaso.e_situacional}
                                                            onChange={(e) =>
                                                                setNuevoCaso((prevCaso) => ({
                                                                    ...prevCaso,
                                                                    e_situacional: e.target.value
                                                                }))
                                                            }
                                                            fullWidth
                                                        />
                                                        <Grid container spacing={2} style={{ marginTop: "20px" }}>
                                                            <Grid item xs={6}>
                                                                <Button onClick={agregarCaso} variant="contained" color="primary" fullWidth>
                                                                    Agregar Caso
                                                                </Button>
                                                            </Grid>
                                                            <Grid item xs={6}>
                                                                <Button onClick={eliminarCaso} variant="contained" color="secondary" fullWidth>
                                                                    Eliminar Caso
                                                                </Button>
                                                            </Grid>
                                                        </Grid>
                                                    </>
                                                )}
                                            </Box>
                                        </Modal>
                                        {/* Modal para Historial */}
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
                                        {/* Modal Avanzado: solo botón "Historial" */}
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
                                                        handleOpenHistorial(selectedRegistroPPU);
                                                        setAdvancedModalOpen(false);
                                                    }}
                                                    fullWidth
                                                >
                                                    Historial
                                                </Button>
                                            </Box>
                                        </Modal>
                                        {/* Tabla compacta con encabezados paginados */}
                                            <Paper elevation={3} sx={{ p: 2, mb: 2 }}>
                                                <Box mb={2} display="flex" justifyContent="center">
                                                    <Button variant="contained" onClick={() => setHeaderPage(headerPage === 1 ? 2 : 1)}>
                                                        {headerPage === 1 ? "Mostrar Página 2" : "Mostrar Página 1"}
                                                    </Button>
                                                </Box>

                                                <TableContainer component={Paper} sx={{ maxHeight: "60vh", overflow: "auto" }}>
                                                    <Table
                                                        stickyHeader
                                                        aria-label="tabla principal"
                                                        sx={{ minWidth: 800, tableLayout: "fixed", fontSize: "0.8rem" }}
                                                    >
                                                        <TableHead>
                                                            <TableRow>
                                                                {(() => {
                                                                    // Cabecera fija
                                                                    const fixedHeader = "Registro PPU";

                                                                    // Resto de columnas
                                                                    const otherHeaders = [
                                                                        "Situacion",
                                                                        "Abogado",
                                                                        "Denunciado",
                                                                        "Caso fiscal corto o expediente",
                                                                        "Caso fiscal completo",
                                                                        "Delito",
                                                                        "Departamento",
                                                                        "Fiscalia",
                                                                        "Juzgado",
                                                                        "Informe Juridico",
                                                                        "Fecha Ingreso",
                                                                        "Ultima Modificacion",
                                                                        "Etiqueta",
                                                                        "Acciones",
                                                                    ];

                                                                    const half = Math.ceil(otherHeaders.length / 2);

                                                                    // Dependiendo de headerPage = 1 o 2, cortamos la mitad de las columnas
                                                                    const displayedHeaders =
                                                                        headerPage === 1 ? otherHeaders.slice(0, half) : otherHeaders.slice(half);

                                                                    // Devolvemos la cabecera "Registro PPU" + las 'displayedHeaders'
                                                                    return [fixedHeader, ...displayedHeaders].map((header, idx) => (
                                                                        <TableCell
                                                                            key={idx}
                                                                            sx={{
                                                                                p: 1,
                                                                                fontSize: "0.75rem",
                                                                                textAlign: "center",
                                                                                wordBreak: "break-word",
                                                                            }}
                                                                        >
                                                                            {header}
                                                                        </TableCell>
                                                                    ));
                                                                })()}
                                                            </TableRow>
                                                        </TableHead>

                                                        <TableBody>
                                                            {datos.map((dato) => {
                                                                // Detectamos si la fila está en modo edición
                                                                const isEditing = editingRowId === dato.registro_ppu;

                                                                // Función local que decide qué mostrar según (1) isEditing, (2) rol, (3) campo
                                                                const renderCellContent = (fieldValue, fieldKey) => {
                                                                    // Si la fila NO está en edición, solo mostramos el valor
                                                                    if (!isEditing) {
                                                                        return fieldValue;
                                                                    }

                                                                    // Si la fila ESTÁ en edición:
                                                                    // 1) "registro_ppu" y "Acciones" no se editan nunca
                                                                    if (fieldKey === "registro_ppu" || fieldKey === "acciones") {
                                                                        return fieldValue;
                                                                    }

                                                                    // 2) Rol "admin": puede editar cualquier campo excepto los de arriba
                                                                    if (role === "admin") {
                                                                        return (
                                                                            <TextField
                                                                                value={editedData[fieldKey] || ""}
                                                                                onChange={(e) =>
                                                                                    setEditedData({ ...editedData, [fieldKey]: e.target.value })
                                                                                }
                                                                                fullWidth
                                                                                variant="outlined"
                                                                                sx={{ fontSize: "0.75rem" }}
                                                                            />
                                                                        );
                                                                    }

                                                                    // 3) Rol "user": solo "etiqueta" es editable
                                                                    if (role === "user") {
                                                                        if (fieldKey === "etiqueta") {
                                                                            return (
                                                                                <TextField
                                                                                    value={editedData.etiqueta || ""}
                                                                                    onChange={(e) =>
                                                                                        setEditedData({ ...editedData, etiqueta: e.target.value })
                                                                                    }
                                                                                    fullWidth
                                                                                    variant="outlined"
                                                                                    sx={{ fontSize: "0.75rem" }}
                                                                                />
                                                                            );
                                                                        } else {
                                                                            // Resto de columnas => modo lectura
                                                                            return fieldValue;
                                                                        }
                                                                    }

                                                                    // Por defecto (si hubiera otro rol no contemplado), mostramos lectura
                                                                    return fieldValue;
                                                                };

                                                                // Celda fija para "Registro PPU"
                                                                const fixedCell = (
                                                                    <TableCell
                                                                        key="registro_ppu"
                                                                        sx={{
                                                                            p: 1,
                                                                            textAlign: "center",
                                                                            wordBreak: "break-word",
                                                                        }}
                                                                    >
                                                                        {dato.registro_ppu || ""}
                                                                    </TableCell>
                                                                );

                                                                // Creamos un array con [valor, key] para cada campo
                                                                const columnsData = [
                                                                    [dato.e_situacional, "e_situacional"],
                                                                    [dato.abogado, "abogado"],
                                                                    [dato.denunciado, "denunciado"],
                                                                    [dato.origen, "origen"],
                                                                    [dato["nr de exp completo"], "nr_de_exp_completo"], // Fíjate en la consistencia de la clave
                                                                    [dato.delito, "delito"],
                                                                    [dato.departamento, "departamento"],
                                                                    [dato.fiscalia, "fiscalia"],
                                                                    [dato.juzgado, "juzgado"],
                                                                    [dato.informe_juridico, "informe_juridico"],
                                                                    [dato.fecha_ingreso, "fecha_ingreso"],
                                                                    [dato.last_modified, "last_modified"],
                                                                    [dato.etiqueta, "etiqueta"],
                                                                    // Columna "Acciones"
                                                                    [
                                                                        <Box key="acciones" display="flex" justifyContent="center" gap={1}>
                                                                            {/* Botón principal para editar o guardar */}
                                                                            <Button
                                                                                variant="contained"
                                                                                color="primary"
                                                                                onClick={() => (isEditing ? handleSaveClick() : handleEditClick(dato))}
                                                                                sx={{ minWidth: 80 }}
                                                                            >
                                                                                {isEditing ? "Guardar" : "Modificar"}
                                                                            </Button>

                                                                            {/* Botón secundario "Avanzado" */}
                                                                            <Button
                                                                                variant="outlined"
                                                                                color="secondary"
                                                                                onClick={() => {
                                                                                    // Ajustas la lógica que necesites...
                                                                                    setSelectedRegistroPPU(dato.registro_ppu);
                                                                                    setAdvancedModalOpen(true);
                                                                                }}
                                                                                sx={{ minWidth: 80 }}
                                                                            >
                                                                                Avanzado
                                                                            </Button>
                                                                        </Box>,
                                                                        "acciones",
                                                                    ],
                                                                ];

                                                                // Dividimos columnsData en 2 mitades
                                                                const half = Math.ceil(columnsData.length / 2);
                                                                const displayedCols =
                                                                    headerPage === 1 ? columnsData.slice(0, half) : columnsData.slice(half);

                                                                // Renderizamos las celdas de la mitad correspondiente
                                                                const renderedCells = displayedCols.map(([value, key], colIndex) => (
                                                                    <TableCell
                                                                        key={key || colIndex}
                                                                        sx={{
                                                                            p: 1,
                                                                            textAlign: "center",
                                                                            wordBreak: "break-word",
                                                                        }}
                                                                    >
                                                                        {renderCellContent(value, key)}
                                                                    </TableCell>
                                                                ));

                                                                return (
                                                                    <TableRow
                                                                        key={dato.registro_ppu}
                                                                        hover
                                                                        sx={{
                                                                            backgroundColor: getRowBackgroundColor(dato),
                                                                            fontSize: "0.75rem",
                                                                        }}
                                                                    >
                                                                        {fixedCell}
                                                                        {renderedCells}
                                                                    </TableRow>
                                                                );
                                                            })}
                                                        </TableBody>
                                                    </Table>
                                                </TableContainer>
                                            </Paper>
                                            <Box display="flex" justifyContent="center" mb={4}>
                                                <Pagination
                                                    count={totalPages}
                                                    page={page}
                                                    onChange={(e, value) => setPage(value)}
                                                    color="primary"
                                                    showFirstButton
                                                    showLastButton
                                                />
                                            </Box>
                                    </>
                                )}
                            </>
                        )}




                        <Box mb={2} display="flex" justifyContent="flex-end">
                            <Button
                                variant="contained"
                                color={useML ? "success" : "primary"}
                                onClick={() => setUseML(!useML)}
                            >
                                USO DE MACHINE LEARNING
                            </Button>
                        </Box>

                        {role === 'admin' && tab === 2 && isLoggedIn && (
                            <>
                                <Box mb={2}>
                                    <Box {...getRootProps()} sx={{
                                        border: '2px dashed #aaa',
                                        padding: '20px',
                                        textAlign: 'center',
                                        cursor: 'pointer'
                                    }}>
                                        <input {...getInputProps()} />
                                        {isDragActive ?
                                            <Typography>Soltar archivos aquí...</Typography> :
                                            <Typography>Arrastrar y soltar múltiples PDFs, o hacer clic para seleccionar.</Typography>
                                        }
                                    </Box>
                                    {pdfFiles.length > 0 && (
                                        <Box mt={2}>
                                            <Typography variant="subtitle1">Archivos Procesados:</Typography>
                                            <ul>
                                                {[...pdfFiles]
                                                    .sort((a, b) => a.name.localeCompare(b.name))
                                                    .map((file, index) => (
                                                        <li key={index}>{file.name}</li>
                                                    ))}
                                            </ul>
                                        </Box>
                                    )}
                                </Box>

                                {mostrarTablaMinimal && datosMinimal.length > 0 && (
                                    <Paper
                                        elevation={3}
                                        style={isExpanded ? styles.expandedContainer : { padding: '10px', marginBottom: '20px' }}
                                    >
                                        {isExpanded && (
                                            <Button
                                                variant="contained"
                                                color="secondary"
                                                onClick={toggleExpand}
                                                style={{ marginBottom: '10px' }}
                                            >
                                                Cerrar Modo Expandido
                                            </Button>
                                        )}
                                        {!isExpanded && (
                                            <Button
                                                variant="contained"
                                                color="primary"
                                                onClick={toggleExpand}
                                                style={{ marginBottom: '10px' }}
                                            >
                                                Expandir Tabla
                                            </Button>
                                        )}
                                        {!isExpanded && (
                                            <>
                                                <Typography variant="h6" gutterBottom>
                                                    Resumen Minimalista
                                                </Typography>
                                                <Typography variant="body2" gutterBottom>
                                                    Click para seleccionar, flechas para navegar, Enter para editar.
                                                </Typography>
                                            </>
                                        )}
                                        {/* Botón para alternar entre vista minimal (hoja 1) y vista completa (hoja 2) */}
                                        <Box display="flex" justifyContent="flex-end" mb={1}>
                                            <Button variant="text" onClick={() => setVistaMinimal(!vistaMinimal)}>
                                                {vistaMinimal ? 'Ver vista completa' : 'Ver vista minimal'}
                                            </Button>
                                        </Box>

                                        <TableContainer
                                            component={Paper}
                                            style={{
                                                ...styles.expandedTable,
                                                tableLayout: 'fixed',
                                                width: isExpanded ? '100%' : 'auto',
                                                height: isExpanded ? '100%' : '60vh'
                                            }}
                                        >
                                            <Table
                                                size="small"
                                                stickyHeader
                                                aria-label="tabla minimalista"
                                                style={{ tableLayout: 'auto', width: '100%' }}
                                            >
                                                <TableHead>
                                                    <TableRow>
                                                        {
                                                            vistaMinimal
                                                                ? columnasMinimal.map((col, cindex) => (
                                                                    <TableCell
                                                                        key={cindex}
                                                                        style={
                                                                            col === 'e_situacional'
                                                                                ? { ...minimalStylesHeader, ...eSituacionalStyle }
                                                                                : minimalStylesHeader
                                                                        }
                                                                    >
                                                                        {col}
                                                                    </TableCell>
                                                                ))
                                                                : (() => {
                                                                    let cols = getColumnOrder(datosMinimal[0]);
                                                                
                                                                    return cols.map((col, cindex) => (
                                                                        <TableCell
                                                                            key={cindex}
                                                                            style={
                                                                                col === 'e_situacional'
                                                                                    ? { ...minimalStylesHeader, ...eSituacionalStyle }
                                                                                    : minimalStylesHeader
                                                                            }
                                                                        >
                                                                            {col}
                                                                        </TableCell>
                                                                    ));
                                                                })()
                                                        }




                                                        {/* Nueva columna "Audiencia" */}
                                                        <TableCell key="audiencia" style={minimalStylesHeader}>
                                                            Audiencia
                                                        </TableCell>
                                                    </TableRow>
                                                </TableHead>


                                                <TableBody>
                                                    {datosMinimal.map((row, rindex) => {
                                                        const columns = vistaMinimal ? columnasMinimal : columnsOrder;
                                                        return (
                                                            <MinimalTableRow
                                                                key={rindex}
                                                                row={row}
                                                                rindex={rindex}
                                                                columns={columns}
                                                                minimalStylesCell={minimalStylesCell}
                                                                getCellBackgroundColor={getCellBackgroundColor}
                                                                selectedCell={selectedCell}
                                                                editingCell={editingCell}
                                                                setSelectedCell={setSelectedCell}
                                                                setEditingCell={setEditingCell}
                                                                toggleAudiencia={toggleAudiencia}
                                                                renderCellContent={renderCellContent}
                                                                handleCellKeyDown={handleCellKeyDown}
                                                            />
                                                        );
                                                    })}
                                                </TableBody>



                                            </Table>
                                        </TableContainer>
                                        <Box
                                            mt={2}
                                            display="flex"
                                            justifyContent="space-between"
                                            gap={2}
                                            style={isExpanded ? styles.expandedButtons : {}}
                                        >
                                            <Button
                                                variant="contained"
                                                color="secondary"
                                                onClick={limpiarTabla}
                                            >
                                                Limpiar Tabla
                                            </Button>
                                            <Button
                                                variant="contained"
                                                color="error"
                                                onClick={() => retirarFila(selectedCell.row)}
                                                disabled={datosMinimal.length === 0 || selectedCell.row >= datosMinimal.length}
                                            >
                                                Retirar Fila Seleccionada
                                            </Button>
                                            <Button variant="contained" color="primary" onClick={actualizarMinimal}>
                                                Actualizar
                                            </Button>
                                        </Box>
                                    </Paper>
                                )}
                            </>
                        )}
                        {/* Modal para historial en vista minimal */}
                        <Modal
                            open={openHistorialMinimal}
                            onClose={() => { setOpenHistorialMinimal(false); setHistorialData([]); }}
                        >
                            <Box
                                sx={{
                                    position: 'absolute',
                                    top: '50%',
                                    left: '50%',
                                    transform: 'translate(-50%, -50%)',
                                    width: '80%',
                                    maxWidth: '900px',
                                    bgcolor: 'background.paper',
                                    border: '2px solid #000',
                                    boxShadow: 24,
                                    p: 4,
                                    maxHeight: '80vh',
                                    overflowY: 'auto',
                                }}
                            >
                                <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
                                    Historial de Cambios en la Situación (Vista Minimal) - {selectedRegistroPPU}
                                </Typography>
                                {historialData.length > 0 ? (
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
                                                {historialData.map((entry, i) => (
                                                    <TableRow key={i}>
                                                        <TableCell>{entry.version_id}</TableCell>
                                                        <TableCell>{entry.abogado}</TableCell>
                                                        <TableCell>{entry.origen}</TableCell>
                                                        <TableCell>{entry.e_situacional}</TableCell>
                                                        <TableCell>
                                                            <Button
                                                                variant="outlined"
                                                                size="small"
                                                                onClick={(e) => {
                                                                    e.preventDefault();
                                                                    window.open(
                                                                        `${API_BASE_URL}/api/descargar_pdf?ruta=${encodeURIComponent(entry.ruta)}`,
                                                                        '_blank'
                                                                    );
                                                                }}
                                                            >
                                                                Ver PDF
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </TableContainer>
                                ) : (
                                    <Typography>No hay historial con PDF para este registro.</Typography>
                                )}
                            </Box>
                        </Modal>



                        {/* Bloque 1: Plazos y Acciones */}
                        {isLoggedIn &&
                            (
                                (role === 'admin' && tab === 3)  // admin => pestaña 3
                                || (role === 'user' && tab === 2)  // user  => pestaña 2
                                || ((Array.isArray(role) && role.includes('coordinador')) && tab === 2) // coordinador en pestaña 2
                            ) && (
                                <>

                                {/* ---------------------- */}
                                {/* TABLA DE “PLAZOS Y ACCIONES” (SIN VENCIDOS NI ATENDIDOS) */}
                                {/* ---------------------- */}
                                <Box mb={2}>
                                    <Grid container spacing={2} alignItems="center">
                                        <Grid item xs={12} md={4}>
                                            <TextField
                                                label="Buscar"
                                                variant="outlined"
                                                value={queryPlazos}
                                                onChange={handleQueryPlazosChange}
                                                fullWidth
                                            />
                                        </Grid>
                                            <Grid item xs={12} md={3}>
                                                {role === 'admin' ? (
                                                    <FormControl variant="outlined" fullWidth>
                                                        <InputLabel>Filtrar por abogado</InputLabel>
                                                        <Select
                                                            value={selectedAbogadoPlazos}
                                                            onChange={(e) => {
                                                                setSelectedAbogadoPlazos(e.target.value);
                                                                setPagePlazos(1);
                                                                debouncedBuscarPlazosData(
                                                                    1,
                                                                    queryPlazos,
                                                                    e.target.value,
                                                                    mostrarArchivadosPlazos
                                                                );
                                                            }}
                                                            label="Filtrar por abogado"
                                                        >
                                                            <MenuItem value=""><em>Ninguno</em></MenuItem>
                                                            <MenuItem value="CUBA">CUBA</MenuItem>
                                                            <MenuItem value="AGUILAR">AGUILAR</MenuItem>
                                                            <MenuItem value="POLO">POLO</MenuItem>
                                                            <MenuItem value="MAU">MAU</MenuItem>
                                                            <MenuItem value="ASCURRA">ASCURRA</MenuItem>
                                                            <MenuItem value="FLORES">FLORES</MenuItem>
                                                            <MenuItem value="MARTINEZ">MARTINEZ</MenuItem>
                                                            <MenuItem value="PALACIOS">PALACIOS</MenuItem>
                                                            <MenuItem value="POMAR">POMAR</MenuItem>
                                                            <MenuItem value="ROJAS">ROJAS</MenuItem>
                                                            <MenuItem value="FRISANCHO">FRISANCHO</MenuItem>
                                                            <MenuItem value="NAVARRO">NAVARRO</MenuItem>
                                                        </Select>
                                                    </FormControl>
                                                ) : (
                                                    <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
                                                        Abogado: {username.toUpperCase()} (filtro forzado)
                                                    </Typography>
                                                )}
                                            </Grid>

                                        <Grid item xs={12} md={2}>
                                            <FormControlLabel
                                                control={
                                                    <Checkbox
                                                        checked={mostrarArchivadosPlazos}
                                                        onChange={(e) => {
                                                            setMostrarArchivadosPlazos(e.target.checked);
                                                            setPagePlazos(1);
                                                            debouncedBuscarPlazosData(
                                                                1,
                                                                queryPlazos,
                                                                selectedAbogadoPlazos,
                                                                e.target.checked
                                                            );
                                                        }}
                                                        color="primary"
                                                    />
                                                }
                                                label="¿Mostrar archivados?"
                                            />
                                        </Grid>
                                        <Grid item xs={12} md={3}>
                                            <Button
                                                variant="contained"
                                                color="success"
                                                onClick={exportarExcelPlazos}
                                                fullWidth
                                                style={{ height: '56px' }}
                                            >
                                                Exportar Excel
                                            </Button>
                                        </Grid>
                                    </Grid>
                                </Box>

                                {loadingPlazos ? (
                                    <Typography>Cargando...</Typography>
                                ) : errorPlazos ? (
                                    <Typography color="error">{errorPlazos}</Typography>
                                ) : (
                                    <Paper elevation={3} style={{ padding: '20px' }}>
                                        {/* Filtra y excluye "ATENDIDA" y "Vencido" */}
                                        {(() => {
                                            // Aplica filtro
                                            const filteredData = plazosData.filter(
                                                (row) =>
                                                    row.seguimiento !== "ATENDIDA" &&
                                                    row.dias_restantes !== "Vencido"
                                            );

                                            // Ordena
                                            const sortedData = [...filteredData].sort(
                                                (a, b) => a.sortingValue - b.sortingValue
                                            );

                                            // Calcula "totalRecordsPlazos" para esta tabla
                                            const totalRecordsNoVencidos = sortedData.length;

                                            return (
                                                <>
                                                    <Typography variant="h6" component="div" style={{ marginBottom: '20px' }}>
                                                        Total de Procesos: {totalRecordsNoVencidos}
                                                    </Typography>

                                                    <TableContainer
                                                        component={Paper}
                                                        style={{ maxHeight: '60vh', overflow: 'auto' }}
                                                    >
                                                        <Table
                                                            stickyHeader
                                                            aria-label="tabla plazos y acciones"
                                                            style={{ minWidth: 1200 }}
                                                        >
                                                            <TableHead>
                                                                <TableRow>
                                                                    <TableCell>INFORMACION RELEVANTE</TableCell>
                                                                    <TableCell>ABOGADO</TableCell>
                                                                    <TableCell>ACCION</TableCell>
                                                                    <TableCell>PLAZO RESTANTE</TableCell>
                                                                    <TableCell>SEGUIMIENTO</TableCell>
                                                                    <TableCell>NOTIFICACION</TableCell>
                                                                    <TableCell>Fecha del plazo</TableCell>
                                                                    <TableCell>Registro PPU</TableCell>
                                                                    <TableCell>IMPUTADO</TableCell>
                                                                    <TableCell>Expediente o caso</TableCell>
                                                                    <TableCell>Fiscalia</TableCell>
                                                                    <TableCell>Juzgado</TableCell>
                                                                    <TableCell>Departamento</TableCell>
                                                                </TableRow>
                                                            </TableHead>
                                                            <TableBody>
                                                                {sortedData.map((row, index) => (
                                                                    <TableRow
                                                                        key={row.id || row.registro_ppu}
                                                                        hover
                                                                        style={{
                                                                            backgroundColor: getRowBackgroundColor(row),
                                                                        }}
                                                                    >
                                                                        <TableCell>{row.e_situacional}</TableCell>
                                                                        <TableCell>{row.abogado}</TableCell>
                                                                        <TableCell>{row.accion}</TableCell>
                                                                        <TableCell>{row.dias_restantes}</TableCell>

                                                                        {/* Botón => Modal para PDF y marcar ATENDIDA */}
                                                                        <TableCell>
                                                                            <Button
                                                                                variant="contained"
                                                                                color="primary"
                                                                                size="small"
                                                                                onClick={() => handleOpenSeguimientoModal(row, "plazos_acciones")} // Identificador único
                                                                            >
                                                                                Subir Seguimiento
                                                                            </Button>

                                                                        </TableCell>

                                                                        <TableCell>
                                                                            <a
                                                                                href={`file://${row.ruta}`}
                                                                                onClick={(e) => handleRutaClick(e, row.ruta)}
                                                                                style={{
                                                                                    textDecoration: "none",
                                                                                    color: "blue",
                                                                                }}
                                                                            >
                                                                                Ver PDF
                                                                            </a>
                                                                        </TableCell>
                                                                        <TableCell>
                                                                            {formatDate(row.fecha_atencion)}
                                                                        </TableCell>
                                                                        <TableCell>{row.registro_ppu}</TableCell>
                                                                        <TableCell>{row.denunciado}</TableCell>
                                                                        <TableCell>{row.origen}</TableCell>
                                                                        <TableCell>{row.fiscalia}</TableCell>
                                                                        <TableCell>{row.juzgado}</TableCell>
                                                                        <TableCell>{row.departamento}</TableCell>
                                                                    </TableRow>
                                                                ))}
                                                            </TableBody>
                                                        </Table>
                                                    </TableContainer>

                                                    {/* Aquí si quieres, podrías tener otra paginación 
                                distinta a la global, o reutilizar "pagePlazos" */}
                                                    <Box display="flex" justifyContent="center" mt={4}>
                                                        <Pagination
                                                            count={
                                                                // si deseas calcular pages en base a "totalRecordsNoVencidos"
                                                                // y 200 filas por página, por ejemplo:
                                                                Math.ceil(totalRecordsNoVencidos / 200)
                                                            }
                                                            page={pagePlazos}
                                                            onChange={(e, value) => {
                                                                setPagePlazos(value);
                                                                debouncedBuscarPlazosData(
                                                                    value,
                                                                    queryPlazos,
                                                                    selectedAbogadoPlazos,
                                                                    mostrarArchivadosPlazos
                                                                );
                                                            }}
                                                            color="primary"
                                                            showFirstButton
                                                            showLastButton
                                                        />
                                                    </Box>
                                                </>
                                            );
                                        })()}
                                    </Paper>
                                )}

                               

                                </>
                            )
                        }  {/* <-- cierras aquí el condicional del Bloque 1 con una } */}
                            
                                    {/* Bloque 2: Plazos Vencidos */}
                        {
                            isLoggedIn &&
                            (((role === 'admin' && tab === 4) ||
                                (role === 'user' && tab === 3) ||
                                ((Array.isArray(role) && role.includes('coordinador')) && tab === 3)
                            ) && (
                                <>
                                    {/* Elementos de búsqueda y filtros */}
                                    <Box mb={2}>
                                        <Grid container spacing={2} alignItems="center">
                                            <Grid item xs={12} md={4}>
                                                <TextField
                                                    label="Buscar"
                                                    variant="outlined"
                                                    value={queryPlazos}
                                                    onChange={handleQueryPlazosChange}
                                                    fullWidth
                                                />
                                            </Grid>
                                            <Grid item xs={12} md={3}>
                                                {role === 'admin' ? (
                                                    <FormControl variant="outlined" fullWidth>
                                                        <InputLabel>Filtrar por abogado</InputLabel>
                                                        <Select
                                                            value={selectedAbogadoPlazos}
                                                            onChange={(e) => {
                                                                setSelectedAbogadoPlazos(e.target.value);
                                                                setPagePlazos(1);
                                                                debouncedBuscarPlazosData(
                                                                    1,
                                                                    queryPlazos,
                                                                    e.target.value,
                                                                    mostrarArchivadosPlazos
                                                                );
                                                            }}
                                                            label="Filtrar por abogado"
                                                        >
                                                            <MenuItem value=""><em>Ninguno</em></MenuItem>
                                                            <MenuItem value="CUBA">CUBA</MenuItem>
                                                            <MenuItem value="AGUILAR">AGUILAR</MenuItem>
                                                            <MenuItem value="POLO">POLO</MenuItem>
                                                            <MenuItem value="MAU">MAU</MenuItem>
                                                            <MenuItem value="ASCURRA">ASCURRA</MenuItem>
                                                            <MenuItem value="FLORES">FLORES</MenuItem>
                                                            <MenuItem value="MARTINEZ">MARTINEZ</MenuItem>
                                                            <MenuItem value="PALACIOS">PALACIOS</MenuItem>
                                                            <MenuItem value="POMAR">POMAR</MenuItem>
                                                            <MenuItem value="ROJAS">ROJAS</MenuItem>
                                                            <MenuItem value="FRISANCHO">FRISANCHO</MenuItem>
                                                            <MenuItem value="NAVARRO">NAVARRO</MenuItem>
                                                        </Select>
                                                    </FormControl>
                                                ) : (
                                                    <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
                                                        Abogado: {username.toUpperCase()} (filtro forzado)
                                                    </Typography>
                                                )}
                                            </Grid>
                                            <Grid item xs={12} md={2}>
                                                <FormControlLabel
                                                    control={
                                                        <Checkbox
                                                            checked={mostrarArchivadosPlazos}
                                                            onChange={(e) => {
                                                                setMostrarArchivadosPlazos(e.target.checked);
                                                                setPagePlazos(1);
                                                                debouncedBuscarPlazosData(
                                                                    1,
                                                                    queryPlazos,
                                                                    selectedAbogadoPlazos,
                                                                    e.target.checked
                                                                );
                                                            }}
                                                            color="primary"
                                                        />
                                                    }
                                                    label="¿Mostrar archivados?"
                                                />
                                            </Grid>
                                            <Grid item xs={12} md={3}>
                                                <Button
                                                    variant="contained"
                                                    color="success"
                                                    onClick={exportarExcelPlazos}
                                                    fullWidth
                                                    style={{ height: '56px' }}
                                                >
                                                    Exportar Excel
                                                </Button>
                                            </Grid>
                                        </Grid>
                                    </Box>

                                    {/* Bloque Principal: Tabla de Plazos Vencidos */}
                                    <Box mt={6} mb={2}>
                                        <Typography variant="h5" component="div">
                                            Tabla de Plazos Vencidos
                                        </Typography>
                                        <Paper elevation={3} style={{ padding: '20px', marginTop: '10px' }}>
                                            {(() => {
                                                // Filtra SOLO los registros con "Vencido" y que NO estén atendidos
                                                const vencidosData = plazosData.filter((row) => {
                                                    const seguimientoLimpio = (row.seguimiento || '').trim().toUpperCase();
                                                    return row.dias_restantes === 'Vencido' && seguimientoLimpio !== 'ATENDIDA';
                                                });

                                                // Ordena los vencidos según sortingValue
                                                const sortedVencidos = [...vencidosData].sort((a, b) => a.sortingValue - b.sortingValue);
                                                const totalRecordsVencidos = sortedVencidos.length;

                                                return (
                                                    <>
                                                        <Typography variant="h6" component="div" style={{ marginBottom: '20px' }}>
                                                            Total Vencidos: {totalRecordsVencidos}
                                                        </Typography>

                                                        <TableContainer component={Paper} style={{ maxHeight: '60vh', overflow: 'auto' }}>
                                                            <Table stickyHeader aria-label="tabla de plazos vencidos" style={{ minWidth: 1200 }}>
                                                                <TableHead>
                                                                    <TableRow>
                                                                        <TableCell>INFORMACION RELEVANTE</TableCell>
                                                                        <TableCell>ABOGADO</TableCell>
                                                                        <TableCell>ACCION</TableCell>
                                                                        <TableCell>PLAZO RESTANTE</TableCell>
                                                                        <TableCell>SEGUIMIENTO</TableCell>
                                                                        <TableCell>NOTIFICACION</TableCell>
                                                                        <TableCell>Fecha del plazo</TableCell>
                                                                        <TableCell>Registro PPU</TableCell>
                                                                        <TableCell>IMPUTADO</TableCell>
                                                                        <TableCell>Expediente o caso</TableCell>
                                                                        <TableCell>Fiscalia</TableCell>
                                                                        <TableCell>Juzgado</TableCell>
                                                                        <TableCell>Departamento</TableCell>
                                                                        {role === 'admin' && <TableCell>Acciones</TableCell>}
                                                                    </TableRow>
                                                                </TableHead>
                                                                <TableBody>
                                                                    {sortedVencidos.map((row, index) => (
                                                                        <TableRow
                                                                            key={row.id || row.registro_ppu}
                                                                            hover
                                                                            style={{ backgroundColor: getRowBackgroundColor(row) }}
                                                                        >
                                                                            <TableCell>{row.e_situacional}</TableCell>
                                                                            <TableCell>{row.abogado}</TableCell>
                                                                            <TableCell>{row.accion}</TableCell>
                                                                            <TableCell>{row.dias_restantes}</TableCell>

                                                                            {/* Botón para subir seguimiento */}
                                                                            <TableCell>
                                                                                <Button
                                                                                    variant="contained"
                                                                                    color="primary"
                                                                                    size="small"
                                                                                    onClick={() => handleOpenSeguimientoModal(row, "plazos_vencidos")}
                                                                                >
                                                                                    Subir Seguimiento
                                                                                </Button>
                                                                            </TableCell>

                                                                            <TableCell>
                                                                                <a
                                                                                    href={`file://${row.ruta}`}
                                                                                    onClick={(e) => handleRutaClick(e, row.ruta)}
                                                                                    style={{ textDecoration: "none", color: "blue" }}
                                                                                >
                                                                                    Ver PDF
                                                                                </a>
                                                                            </TableCell>
                                                                            <TableCell>{formatDate(row.fecha_atencion)}</TableCell>
                                                                            <TableCell>{row.registro_ppu}</TableCell>
                                                                            <TableCell>{row.denunciado}</TableCell>
                                                                            <TableCell>{row.origen}</TableCell>
                                                                            <TableCell>{row.fiscalia}</TableCell>
                                                                            <TableCell>{row.juzgado}</TableCell>
                                                                            <TableCell>{row.departamento}</TableCell>
                                                                            {role === 'admin' && (
                                                                                <TableCell>
                                                                                    <Button
                                                                                        variant="contained"
                                                                                        color="error"
                                                                                        size="small"
                                                                                        onClick={() => handleBorrarFila(row.id)}
                                                                                    >
                                                                                        Borrar Fila
                                                                                    </Button>
                                                                                </TableCell>
                                                                            )}
                                                                        </TableRow>
                                                                    ))}
                                                                </TableBody>
                                                            </Table>
                                                        </TableContainer>

                                                        <Box display="flex" justifyContent="center" mt={4}>
                                                            <Pagination
                                                                count={Math.ceil(totalRecordsVencidos / 200)}
                                                                page={pagePlazos}
                                                                onChange={(e, value) => {
                                                                    setPagePlazos(value);
                                                                    debouncedBuscarPlazosData(
                                                                        value,
                                                                        queryPlazos,
                                                                        selectedAbogadoPlazos,
                                                                        mostrarArchivadosPlazos
                                                                    );
                                                                }}
                                                                color="primary"
                                                                showFirstButton
                                                                showLastButton
                                                            />
                                                        </Box>
                                                    </>
                                                );
                                            })()}
                                        </Paper>
                                    </Box>
                                </>
                            )
                        )}



                </>
            )}
        </div>
    );
}

export default App;



