import React, {
    useState,
    useRef,
    useCallback,
    useEffect,
    useMemo,
    memo
} from 'react';
import axios from 'axios';
import debounce from 'lodash.debounce';
import InputAdornment from '@mui/material/InputAdornment';
import {
    Table,
    TableHead,
    TableRow,
    TableCell,
    TableBody,
    TableContainer,
    Paper,
    Button,
    Typography,
    TextField,
    Box,
    Modal,
    IconButton,
    Backdrop,
    CircularProgress          // ← NUEVO
} from '@mui/material';

import { useDropzone } from 'react-dropzone';
import { FormControl, FormLabel, RadioGroup, FormControlLabel, Radio, Checkbox } from '@mui/material';

import { LocalizationProvider, DesktopDatePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { es } from 'date-fns/locale';
import HistoryIcon from '@mui/icons-material/History';
import './tabla_minima.css';

const registroPPURegex = /(D-\d{1,4}-\d{4}(?:-[A-Z])?|LEG-\d{1,4}-\d{4}(?:-[A-Z])?|L\.?\s?\d{1,4}-\d{4}(?:-[A-Z])?)/i;

const styles = {
    expandedContainer: {
        width: '100%',
        height: '100%',
        padding: '10px',
        marginBottom: '20px'
    },
    expandedTable: {
        width: '100%',
        height: 'calc(100% - 60px)'
    },
    expandedButtons: {
        position: 'relative'
    }
};

const minimalStylesHeader = {
    textAlign: 'center'
};

const eSituacionalStyle = {
    width: '300px'
};

const columnasMinimal = [
    'fileName',
    'e_situacional',
    'accion',
    'plazo_atencion',
    'fecha_atencion',
    'ruta'
];

const hoja1Columns = [
    'abogado',
    'registro_ppu',
    'denunciado',
    'origen',
    'nr de exp completo',
    'juzgado'
];

function getColumnOrder(row) {
    const hiddenCols = [
        'id',
        'last_modified',
        'departamento',
        'fecha_de_archivo',
        'fecha_e_situacional',
        'fecha_ingreso',
        'informe_juridico',
        'item',
        'denunciado',
        'registro_ppu',
        'delito',
        'abogado',
        'juzgado',
        'origen',
        'nr de exp completo',
        'hash_sha',
        'seguimiento',
        'audiencia',
        'etiqueta'
    ];
    const minimalStaticColumns = [
        'fileName',
        'e_situacional',
        'accion',
        'plazo_atencion',
        'fecha_atencion',
        'ruta'
    ];

    if (!row) return minimalStaticColumns;

    const allKeys = Object.keys(row);
    const dynamicCols = allKeys.filter(
        (k) =>
            !hiddenCols.includes(k) &&
            !minimalStaticColumns.includes(k) &&
            k !== 'e_situacional' &&
            k !== 'fileName' &&
            k !== 'accion' &&
            k !== 'plazo_atencion' &&
            k !== 'fecha_atencion'
    );
    dynamicCols.sort();
    return [...minimalStaticColumns, ...dynamicCols.filter(col => col !== 'isduplicate')];
}
function buildImmutablePrefix({ tipoNotificacion, numero, anio, cuaderno, lugar, tipoActa, tieneCuaderno, superior }) {
    let prefix = '';
    if (tipoNotificacion === 'DISPOSICIÓN' || tipoNotificacion === 'PROVIDENCIA') {
        const base = (tipoNotificacion === 'DISPOSICIÓN' && superior)
            ? 'DISPOSICIÓN SUPERIOR'
            : tipoNotificacion;
        const numeroDisplay = numero && numero !== 'S/N'
            ? `N° ${numero}`
            : numero || '';
        prefix = `${base} ${numeroDisplay}-${anio || ''}`.trim();
    } else if (tipoNotificacion === 'RESOLUCIÓN') {
        const numeroDisplay = numero && numero !== 'S/N'
            ? `N° ${numero}`
            : numero || '';
        const cuadernoPart = cuaderno
            ? ` DEL CUADERNO ${cuaderno}`
            : '';
        prefix = `${tipoNotificacion} ${numeroDisplay}-${anio || ''}${cuadernoPart}`.trim();
    } else if (tipoNotificacion === 'ACTA') {
        const actaPart = tipoActa
            ? ` (${tipoActa})`
            : '';
        const cuadernoPart = (tieneCuaderno === 'SI' && cuaderno)
            ? ` DEL CUADERNO ${cuaderno}`
            : '';
        prefix = `${tipoNotificacion}${actaPart}${cuadernoPart}`.trim();
    } else if (tipoNotificacion === 'OFICIO' || tipoNotificacion === 'CITACIÓN POLICIAL') {
        const numeroDisplay = numero && numero !== 'S/N'
            ? `N° ${numero}`
            : numero || '';
        const lugarPart = lugar
            ? ` LUGAR ${lugar}`
            : '';
        prefix = `${tipoNotificacion} ${numeroDisplay}-${anio || ''}${lugarPart}`.trim();
    } else if (tipoNotificacion === 'OTROS') {
        prefix = `${tipoNotificacion} ${numero || ''}`.trim();
    } else {
        const numeroDisplay = numero && numero !== 'S/N'
            ? `N° ${numero}`
            : numero || '';
        prefix = `${tipoNotificacion}${numeroDisplay ? ' ' + numeroDisplay : ''}`.trim();
    }
    return prefix;
}

// Ordena el historial según coincidencia con el prefijo

function normalizeForCompare(str) {
    // Elimina ceros a la izquierda tras "N°"
    return str.replace(/N°\s*0+(\d+)/g, 'N° $1');
}

function sortHistory(entries, prefix) {
    const key = normalizeForCompare(prefix).toLowerCase();
    return [...entries].sort((a, b) => {
        const aText = normalizeForCompare(a.e_situacional).toLowerCase();
        const bText = normalizeForCompare(b.e_situacional).toLowerCase();
        const aStarts = aText.startsWith(key);
        const bStarts = bText.startsWith(key);
        if (aStarts !== bStarts) return aStarts ? -1 : 1;
        const aIdx = aText.indexOf(key);
        const bIdx = bText.indexOf(key);
        if ((aIdx === -1) !== (bIdx === -1)) return aIdx !== -1 ? -1 : 1;
        return aIdx - bIdx;
    });
}


// Resalta en rojo la porción que coincide con el prefijo
function highlightMatch(text, prefix) {
    if (!prefix) return text;
    const escaped = prefix.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const re = new RegExp(`(${escaped})`, 'i');
    return text.split(re).map((part, i) =>
        re.test(part)
            ? <span key={i} style={{ color: '#d32f2f' }}>{part}</span>
            : <span key={i}>{part}</span>
    );
}
function TablaMinima() {


    // Dentro del componente que renderiza el modal de edición:


    function EditModal({ editESituacional, setEditESituacional, disabled }) {
        // Estado local para gestionar el valor del input.
        const [localInfo, setLocalInfo] = useState(editESituacional.informacionEspecifica);

        // Sincroniza el estado local cuando cambia la propiedad.
        useEffect(() => {
            setLocalInfo(editESituacional.informacionEspecifica);
        }, [editESituacional.informacionEspecifica]);

        // Al perder el foco, se actualiza el estado global.
        const handleBlur = () => {
            setEditESituacional((prev) => ({ ...prev, informacionEspecifica: localInfo }));
        };

        return (
            <TextField
                label="Información Específica"
                fullWidth
                variant="standard"
                margin="normal"
                multiline
                rows={3}
                value={localInfo}
                disabled={disabled}
                onChange={(e) => setLocalInfo(e.target.value)}
                onBlur={handleBlur}
            />
        );
    }





    // Convierte "dd-MM-yyyy" a objeto Date o a ISO
    const parseDateFromDisplay = (str) => {
        const [dd, mm, yyyy] = str.split('-');
        return /^\d{2}$/.test(dd) && /^\d{2}$/.test(mm) && /^\d{4}$/.test(yyyy)
            ? `${yyyy}-${mm}-${dd}`         // ←  SIN hora, sin Z
            : null;
    };



    const [originalEditData, setOriginalEditData] = useState(null);

    // Convierte una fecha en ISO a "dd-MM-yyyy"
    const formatDateForDisplay = (isoDay) => {
        if (!isoDay) return '';
        const [yyyy, mm, dd] = isoDay.split('-');
        return `${dd}-${mm}-${yyyy}`;
    };


    // Variables de estado y configuración
    const [role, setRole] = useState('admin');
    const [tab, setTab] = useState(2);
    const [isLoggedIn, setIsLoggedIn] = useState(true);
    const API_BASE_URL = 'http://10.50.5.49:5001';

    const [pdfFiles, setPdfFiles] = useState([]);
    const [useML, setUseML] = useState(false);

    const [loading, setLoading] = useState(false);   // ← NUEVO
    const [loadingMsg, setLoadingMsg] = useState('');    // ← NUEVO

    const [openHistorialMinimal, setOpenHistorialMinimal] = useState(false);
    const [selectedRegistroPPU, setSelectedRegistroPPU] = useState('');
    const [historialData, setHistorialData] = useState([]);
    const [historialCache, setHistorialCache] = useState({});
    const [selectedCell, setSelectedCell] = useState({ row: 0, col: 0 });
    const [editingCell, setEditingCell] = useState(null);
    const [editingValues, setEditingValues] = useState({});
    const [vistaMinimal, setVistaMinimal] = useState(false);
    const pdfWindowRef = useRef(null);
    const [celdasEditadas, setCeldasEditadas] = useState({});
    const [datosMinimal, setDatosMinimal] = useState([]);
    const [mostrarTablaMinimal, setMostrarTablaMinimal] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);

    // Estados para el modal de edición y vista de historial completa
    const [openEditModal, setOpenEditModal] = useState(false);
    const [editRowIndex, setEditRowIndex] = useState(null);
    const [editFormValues, setEditFormValues] = useState({
        e_situacional: '',
        accion: '',               // Se usa en modalidades distintas a "AMBOS"
        accionAudiencia: '',      // Se usa cuando se selecciona "AMBOS"
        accionRequerimiento: '',  // Se usa cuando se selecciona "AMBOS"
        plazo_atencion: '',
        fecha_atencion: '',
        denunciado: ''
    });

    const lastActionRowRef = useRef(null);

    function validateHora(hora) {
        const regex = /^(0?[1-9]|1[0-2]):([0-5]\d)$/;
        return regex.test(hora);
    }

    function autoFormatHora(rawHora) {
        let clean = rawHora.replace(/[^\d:]/g, '');
        let parts = clean.split(':');
        let formatted = '';
        if (parts.length === 1) {
            if (clean.length <= 2) {
                formatted = clean;
            } else {
                formatted = clean.slice(0, 2) + ':' + clean.slice(2);
            }
        } else if (parts.length >= 2) {
            formatted = parts[0] + ':' + parts[1];
        }
        return formatted;
    }


    const nonEditableCols = [
        'fileName',
        'registro_ppu',
        'fecha_ingreso',
        'last_modified',
        'ruta',
        'hash_sha',
        'seguimiento'
    ];
    const datePickerCols = ['fecha_atencion'];

    const handlePDFUploadChange = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0];
            setPdfFiles((prev) => [...prev, file]);
        }
    };



    // Dentro de tu componente React:

    const onDrop = useCallback(
        async (acceptedFiles) => {
            setLoading(true);                     // ← inicia loader
            setLoadingMsg('Preparando archivos…');
            console.log("[onDrop] Archivos soltados:", acceptedFiles);


            // 1) Predicción ML en paralelo (si aplica)
            const procesados = await Promise.all(
                acceptedFiles.map(async (file) => {
                    console.log(`[onDrop] Procesando ML para ${file.name}`);
                    setLoadingMsg(`Clasificando “${file.name}”…`);
                    if (useML) {
                        const mlForm = new FormData();
                        mlForm.append("file", file);
                        try {
                            const respML = await axios.post(
                                `${API_BASE_URL}/api/predict_ml`,
                                mlForm,
                                { headers: { "Content-Type": "multipart/form-data" } }
                            );
                            console.log(`[onDrop] ML predicción para ${file.name}:`, respML.data.predicted);
                            file.predicted = respML.data.predicted;
                        } catch (err) {
                            console.error(`[onDrop] Error ML para ${file.name}:`, err);
                        }
                    }
                    return file;
                })
            );
            console.log("[onDrop] Archivos tras ML:", procesados);

            // 2) Construir un único FormData con todos los PDFs
            const batchForm = new FormData();
            procesados.forEach((file) => {
                console.log(`[onDrop] Añadiendo al FormData: ${file.name}`);
                batchForm.append("file", file);
                if (file.predicted) {
                    console.log(`[onDrop] Añadiendo sinoe_tipo=${file.predicted} para ${file.name}`);
                    batchForm.append("sinoe_tipo", file.predicted);
                }
            });

            // 3) Una sola llamada al endpoint /upload
            setLoadingMsg('Subiendo lote al servidor…');

            try {
                console.log("[onDrop] Enviando batch al endpoint /upload");
                const resp = await axios.post(`${API_BASE_URL}/upload`, batchForm, {
                    headers: { "Content-Type": "multipart/form-data" },
                });
                console.log("[onDrop] Respuesta de /upload:", resp.data);

                const archivos = resp.data.archivos || [];
                console.log("[onDrop] Archivos devueltos por el servidor:", archivos);

                if (archivos.length > 0) {
                    setPdfFiles((prev) => [
                        ...prev,
                        ...archivos.map(({ filename, hash_sha, fecha_notificacion }) => {
                            console.log(
                                `[onDrop] Agregando a estado pdfFiles: ${filename}, hash_sha=${hash_sha}, fecha_notificacion=${fecha_notificacion}`
                            );
                            return {
                                name: filename,
                                hash_sha,
                                fecha_notificacion,
                            };
                        }),
                    ]);
                } else {
                    console.warn("[onDrop] No se devolvieron archivos para agregar a pdfFiles");
                }
            } catch (err) {
                setLoadingMsg('Error al subir PDFs');
                console.error("[onDrop] Error al subir lote de archivos:", err);
            } finally {
                // ← ESTE finally se ejecuta siempre, con éxito o con error
                setLoading(false);     // cierra el overlay
            }
        },
        [API_BASE_URL, useML]
    );

    // Configuración de dropzone (permite múltiples archivos PDF)
    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        multiple: true,
        accept: { "application/pdf": [] },
    });


    const [plazoError, setPlazoError] = useState('');
    const [fechaError, setFechaError] = useState('');
    const [editModalTitle, setEditModalTitle] = useState('');

    const handleNotificacionFechaChange = (e) => {
        const inputValue = autoFormatFecha(e.target.value);

        // si está vacío, omitir validación
        if (inputValue.trim() === '') {
            setFechaError('');
        }
        // validación de formato dd‑mm‑aaaa
        else if (!validateFecha(inputValue)) {
            setFechaError('Fecha inválida');
        }
        // validación de rango: no futura ni anterior a 7 días
        else {
            const [dd, mm, yyyy] = inputValue.split('-').map(Number);
            const fecha = new Date(yyyy, mm - 1, dd);
            fecha.setHours(0, 0, 0, 0);

            const hoy = new Date();
            hoy.setHours(0, 0, 0, 0);

            const haceUnaSemana = new Date(hoy);
            haceUnaSemana.setDate(hoy.getDate() - 7);

            if (fecha > hoy) {
                setFechaError('La fecha no puede ser posterior a hoy');
            } else if (fecha < haceUnaSemana) {
                setFechaError('La fecha no puede ser anterior a hace una semana');
            } else {
                setFechaError('');
            }
        }

        setEditFormValues(prev => ({
            ...prev,
            fecha_atencion: inputValue
        }));
    };


    const handleEditFechaChange = (e) => {
        const inputValue = autoFormatFecha(e.target.value);
        // Validar el formato con validateFecha sin transformar el valor
        if (!validateFecha(inputValue)) {
            setFechaError('Fecha inválida');
        } else {
            setFechaError('');
        }
        setEditFormValues(prev => ({ ...prev, fecha_atencion: inputValue }));
    };



    const handleEditPlazoChange = (e) => {
        let formatted = autoFormatHora(e.target.value);
        setEditFormValues((prev) => ({ ...prev, plazo_atencion: formatted }));
        if (formatted && !validateHora(formatted)) {
            setPlazoError('Hora inválida');
        } else {
            setPlazoError('');
        }
    };






    const validateEditModal = () => {
        const { plazo_atencion, fecha_atencion, accion, accionAudiencia, accionRequerimiento, plazoTipo } = editFormValues;
        // Verifica si se ha ingresado alguno de los datos de plazo o fecha.
        // Solo nos interesa si se tocó el PLAZO; la fecha por sí sola ya no obliga a nada
        const anyTimeFilled = plazo_atencion.trim() !== '';


        // En el caso de "AMBOS", se requiere que plazo_atencion, accionAudiencia y accionRequerimiento estén completos.

        if (plazoTipo === 'AUDIENCIA' || plazoTipo === 'AMBOS') {
            const audienciaFilled = [
                editFormValues.accion,
                editFormValues.plazo_fecha,
                editFormValues.plazo_hora,
                editFormValues.AmPm
            ].some(v => (v || '').trim() !== '');

            const requerFilled = plazoTipo === 'AMBOS' && [
                editFormValues.accionAudiencia,
                editFormValues.accionRequerimiento,
                editFormValues.plazo_atencion
            ].some(v => (v || '').trim() !== '');

            const necesitaFecha = audienciaFilled || requerFilled;

            if (necesitaFecha && fecha_atencion.trim() === '') {
                alert('La FECHA DE LA NOTIFICACIÓN no puede quedar vacía cuando ingresa datos en AUDIENCIA o AMBOS.');
                return false;
            }
        }

        // --- Validación específica para AUDIENCIA y REQUERIMIENTO ---
        if (plazoTipo === 'AUDIENCIA') {
            // Para AUDIENCIA se usan: accion, plazo_fecha, plazo_hora y AmPm
            const { accion, plazo_fecha = '', plazo_hora = '', AmPm = '' } = editFormValues;
            const allEmpty = accion.trim() === '' &&
                plazo_fecha.trim() === '' &&
                plazo_hora.trim() === '' &&
                AmPm.trim() === '';
            const allFilled = accion.trim() !== '' &&
                plazo_fecha.trim() !== '' &&
                plazo_hora.trim() !== '' &&
                AmPm.trim() !== '';
            if (!allEmpty && !allFilled) {
                alert('En modo AUDIENCIA, deje vacíos todos los campos (Acción, Fecha, Hora y AM/PM) o complételos todos.');
                return false;
            }
        } else if (plazoTipo === 'REQUERIMIENTO') {
            const { accion, plazo_atencion = '', fecha_atencion = '' } = editFormValues;

            const allEmpty = accion.trim() === '' && plazo_atencion.trim() === '' && fecha_atencion.trim() === '';
            const allFilled = accion.trim() !== '' && plazo_atencion.trim() !== '' && fecha_atencion.trim() !== '';

            // 👉 NUEVO: caso permitido cuando solo se ingresa la FECHA
            const onlyFecha = accion.trim() === '' && plazo_atencion.trim() === '' && fecha_atencion.trim() !== '';

            if (!allEmpty && !allFilled && !onlyFecha) {
                alert('En modo REQUERIMIENTO, complete los tres campos o deje Acción y Plazo vacíos.');
                return false;
            }
        }

        if (anyTimeFilled) {
            if (plazoTipo === 'AMBOS') {
                if (
                    plazo_atencion.trim() === '' ||
                    accionAudiencia.trim() === '' ||
                    accionRequerimiento.trim() === ''
                ) {
                    alert('Si se llenan los campos de plazo o fecha, las acciones de audiencia y requerimiento no pueden quedar vacías.');
                    return false;
                }
            } else if (plazoTipo !== 'AUDIENCIA' && plazoTipo !== 'REQUERIMIENTO') {
                // En otros casos (diferentes a AMBOS, AUDIENCIA y REQUERIMIENTO),
                // se exige que, si se ingresa acción, la fecha no quede vacía.
                if (accion.trim() !== '' && fecha_atencion.trim() === '') {
                    alert('Si se llena el campo de acción, la fecha no puede quedar vacía.');
                    return false;
                }
            }
        }

        // Validación de e_situacional (se omite si modoModificacionPlazo es verdadero).
        if (!modoModificacionPlazo) {
            const { tipoNotificacion, numero, cuaderno, informacionEspecifica } = editESituacional;
            let originalES = { tipoNotificacion: '', numero: '', cuaderno: '', informacionEspecifica: '' };
            if (originalEditData && originalEditData.e_situacional) {
                const parts = originalEditData.e_situacional.split(':');
                if (parts.length > 1) {
                    const leftParts = parts[0].split('N°');
                    originalES.tipoNotificacion = leftParts[0].trim();
                    if (leftParts.length > 1) {
                        const numAndCuaderno = leftParts[1].split('-');
                        originalES.numero = numAndCuaderno[0] ? numAndCuaderno[0].trim() : '';
                        originalES.cuaderno = numAndCuaderno[1] ? numAndCuaderno[1].trim() : '';
                    }
                    originalES.informacionEspecifica = parts[1].trim();
                }
            }
            const esChanged =
                tipoNotificacion.trim() !== originalES.tipoNotificacion.trim() ||
                numero.trim() !== originalES.numero.trim() ||
                cuaderno.trim() !== originalES.cuaderno.trim() ||
                informacionEspecifica.trim() !== originalES.informacionEspecifica.trim();

            if (esChanged) {
                if (
                    tipoNotificacion.trim() !== '' ||
                    numero.trim() !== '' ||
                    cuaderno.trim() !== '' ||
                    informacionEspecifica.trim() !== ''
                ) {
                    if (tipoNotificacion === 'RESOLUCIÓN') {
                        if (
                            tipoNotificacion.trim() === '' ||
                            numero.trim() === '' ||
                            cuaderno.trim() === '' ||
                            informacionEspecifica.trim() === ''
                        ) {
                            alert('Para RESOLUCIÓN, completa los campos: Tipo de Notificación, Número, Cuaderno e Información Específica.');
                            return false;
                        }
                    } else if (tipoNotificacion === 'ACTA') {
                        if (
                            tipoNotificacion.trim() === '' ||
                            informacionEspecifica.trim() === '' ||
                            (editESituacional.tieneCuaderno === 'SI' && cuaderno.trim() === '')
                        ) {
                            alert('Para ACTA, completa los campos requeridos: Tipo de Notificación, Información Específica y, si corresponde, Cuaderno.');
                            return false;
                        }
                    } else if (tipoNotificacion === 'CEDULA') {
                        if (
                            tipoNotificacion.trim() === '' ||
                            informacionEspecifica.trim() === ''
                        ) {
                            alert('Para CÉDULA, completa los campos: Tipo de Notificación e Información Específica.');
                            return false;
                        }
                    } else {
                        if (
                            tipoNotificacion.trim() === '' ||
                            numero.trim() === '' ||
                            informacionEspecifica.trim() === ''
                        ) {
                            alert('Completa todos los campos de e_situacional si se está llenando alguno de los datos.');
                            return false;
                        }
                    }
                }
            }
        }

        // Validación de e_situacional
        if (!modoModificacionPlazo) {
            // Validación de e_situacional
            const { tipoNotificacion, numero, cuaderno, informacionEspecifica } = editESituacional;
            let originalES = { tipoNotificacion: '', numero: '', cuaderno: '', informacionEspecifica: '' };
            if (originalEditData && originalEditData.e_situacional) {
                const parts = originalEditData.e_situacional.split(':');
                if (parts.length > 1) {
                    const leftParts = parts[0].split('N°');
                    originalES.tipoNotificacion = leftParts[0].trim();
                    if (leftParts.length > 1) {
                        const numAndCuaderno = leftParts[1].split('-');
                        originalES.numero = numAndCuaderno[0] ? numAndCuaderno[0].trim() : '';
                        originalES.cuaderno = numAndCuaderno[1] ? numAndCuaderno[1].trim() : '';
                    }
                    originalES.informacionEspecifica = parts[1].trim();
                }
            }
            const esChanged =
                tipoNotificacion.trim() !== originalES.tipoNotificacion.trim() ||
                numero.trim() !== originalES.numero.trim() ||
                cuaderno.trim() !== originalES.cuaderno.trim() ||
                informacionEspecifica.trim() !== originalES.informacionEspecifica.trim();

            if (esChanged) {
                if (
                    tipoNotificacion.trim() !== '' ||
                    numero.trim() !== '' ||
                    cuaderno.trim() !== '' ||
                    informacionEspecifica.trim() !== ''
                ) {
                    if (tipoNotificacion === 'RESOLUCIÓN') {
                        if (
                            tipoNotificacion.trim() === '' ||
                            numero.trim() === '' ||
                            cuaderno.trim() === '' ||
                            informacionEspecifica.trim() === ''
                        ) {
                            alert('Para RESOLUCIÓN, completa los campos: Tipo de Notificación, Número, Cuaderno e Información Específica.');
                            return false;
                        }
                    } else if (tipoNotificacion === 'ACTA') {
                        if (
                            tipoNotificacion.trim() === '' ||
                            informacionEspecifica.trim() === '' ||
                            (editESituacional.tieneCuaderno === 'SI' && cuaderno.trim() === '')
                        ) {
                            alert('Para ACTA, completa los campos requeridos: Tipo de Notificación, Información Específica y, si corresponde, Cuaderno.');
                            return false;
                        }
                    } else if (tipoNotificacion === 'CEDULA') {
                        if (
                            tipoNotificacion.trim() === '' ||
                            informacionEspecifica.trim() === ''
                        ) {
                            alert('Para CÉDULA, completa los campos: Tipo de Notificación e Información Específica.');
                            return false;
                        }
                    } else {
                        if (
                            tipoNotificacion.trim() === '' ||
                            numero.trim() === '' ||
                            informacionEspecifica.trim() === ''
                        ) {
                            alert('Completa todos los campos de e_situacional si se está llenando alguno de los datos.');
                            return false;
                        }
                    }
                }
            }
        }
        // Si modoModificacionPlazo es true, se omite la validación de e_situacional.



        // Verifica errores en campos de plazo y fecha si se ha ingresado información en ellos.
        if (anyTimeFilled && (plazoError || fechaError)) {
            alert('Corrige los errores en los campos de hora o fecha.');
            return false;
        }
        return true;
    };




    const accionRequerimiento = editFormValues.accionRequerimiento;

    const [modoModificacionPlazo, setModoModificacionPlazo] = useState(false);




    // Nuevo estado para construir el e_situacional
    const [editESituacional, setEditESituacional] = useState({
        tipoNotificacion: '',
        numero: '',
        sinNumero: false,
        cuaderno: '',
        lugar: '',               // ← nuevo
        informacionEspecifica: ''
    });

       
    function autoFormatFecha(rawFecha) {
        let clean = rawFecha.replace(/[^\d-]/g, '');
        let parts = clean.split('-');
        let formatted = '';
        if (parts.length === 1) {
            if (clean.length <= 2) {
                formatted = clean;
            } else if (clean.length <= 4) {
                formatted = clean.slice(0, 2) + '-' + clean.slice(2);
            } else {
                formatted = clean.slice(0, 2) + '-' + clean.slice(2, 4) + '-' + clean.slice(4);
            }
        } else if (parts.length === 2) {
            const [dd, mmAndYear] = parts;
            if (mmAndYear.length > 2) {
                formatted = dd + '-' + mmAndYear.slice(0, 2) + '-' + mmAndYear.slice(2);
            } else {
                formatted = dd + '-' + mmAndYear;
            }
        } else if (parts.length >= 3) {
            formatted = parts[0] + '-' + parts[1] + '-' + parts[2];
        }
        return formatted;
    }
    function validateFecha(fecha) {
        const regex = /^(0?[1-9]|[12]\d|3[01])-(0?[1-9]|1[0-2])-\d{4}$/;
        return regex.test(fecha);
    }



    useEffect(() => {
        requestAnimationFrame(() => {
            const cell = document.querySelector(`[data-cell="${selectedCell.row}-${selectedCell.col}"]`);
            if (cell) {
                cell.focus();
            }
        });
    }, [selectedCell, editingCell]);

    useEffect(() => {
        setSelectedCell({ row: 0, col: 0 });
    }, [vistaMinimal]);


    useEffect(() => {
        if (openEditModal && editRowIndex !== null && datosMinimal[editRowIndex]) {
            const row = datosMinimal[editRowIndex];

            // Preparo los valores para el formulario poniendo la fecha en formato dd-MM-yyyy
            setEditFormValues({
                e_situacional: row.e_situacional || '',
                accion: row.accion || '',
                plazo_atencion: row.plazo_atencion || '',
                fecha_atencion: formatDateForDisplay(row.fecha_atencion),
                denunciado: row.denunciado || '',
                audiencia: row.audiencia || false,
                plazoTipo: row.audiencia ? 'AUDIENCIA' : 'REQUERIMIENTO',
                // Campos de "AMBOS", si los usas:
                reprogramacion: row.reprogramacion || 'NO',
                accionAudiencia: row.accionAudiencia || '',
                accionRequerimiento: row.accionRequerimiento || ''
            });

            // Guardo el estado original completo (incluida la fecha en ISO)
            setOriginalEditData({
                ...row,
                fecha_atencion: row.fecha_atencion
            });
        }
    }, [openEditModal, editRowIndex, datosMinimal]);


    useEffect(() => {
        // Si no hay PDFs por procesar, salimos
        if (pdfFiles.length === 0) {
            console.log("[fetchAll] No hay archivos PDF para procesar.");
            return;
        }

        const fetchAll = async () => {
            console.log("[fetchAll] PDF files a procesar:", pdfFiles);

            const results = [];

            // 1) Iterar cada PDF
            for (let file of pdfFiles) {
                const { name: fileName, hash_sha, fecha_notificacion } = file;
                console.log("[fetchAll] ---");
                console.log("[fetchAll] Procesando archivo:", fileName);

                // 1.a) Extraer registro_ppu usando regex
                const match = fileName.match(registroPPURegex);
                if (!match) {
                    console.warn(
                        `[fetchAll] El archivo "${fileName}" NO coincide con el patrón PPU.`
                    );
                    continue;
                }

                const ppuExtracted = match[0].toUpperCase();
                console.log("[fetchAll] Registro PPU extraído:", ppuExtracted);

                try {
                    // 1.b) Llamada al backend para buscar datos
                    const resp = await axios.get(`${API_BASE_URL}/api/buscar`, {
                        params: {
                            query: ppuExtracted,
                            limit: 1,
                            page: 1,
                            mostrar_archivados: true,
                        },
                    });
                    console.log(
                        `[fetchAll] [${fileName}] Respuesta de /api/buscar:`,
                        resp.data
                    );

                    const data = resp.data.data;
                    if (!data || data.length === 0) {
                        console.log(
                            `[fetchAll] [${fileName}] No se encontró data para el registro ${ppuExtracted}.`
                        );
                        continue;
                    }

                    // 1.c) Seleccionar fila exacta o primera
                    const exactMatch = data.find(
                        (d) => (d.registro_ppu || "").toUpperCase() === ppuExtracted
                    );
                    const row = exactMatch || data[0];
                    console.log("[fetchAll] Fila seleccionada para", fileName, ":", row);

                    // 1.d) Asignar metadatos del PDF
                    row.fileName = fileName;
                    row.hash_sha = hash_sha;
                    if (/^\d{4}-\d{2}-\d{2}$/.test(fecha_notificacion)) {
                        row.fecha_notificacion = fecha_notificacion;
                    } else {
                        console.warn(
                            `[fetchAll] Fecha de notificación inválida para ${fileName}:`,
                            fecha_notificacion
                        );
                    }

                    // 1.e) Inicializar campos de la tabla minimal,
                    //     y pre-cargar fecha_atencion desde fecha_notificacion
                    row.accion = "";
                    row.plazo_atencion = "";
                    row.fecha_atencion = /^\d{4}-\d{2}-\d{2}$/.test(fecha_notificacion)
                        ? fecha_notificacion
                        : "";
                    row.audiencia = false;

                    // 1.f) Lógica de ML / duplicados
                    if (useML && file.predicted) {
                        row.predictedFinal = file.predicted;
                        console.log(
                            `[fetchAll] [${fileName}] Predicción ML:`,
                            file.predicted
                        );
                        try {
                            const respCheck = await axios.post(
                                `${API_BASE_URL}/api/check_prediccion_en_situacional`,
                                {
                                    registro_ppu: row.registro_ppu,
                                    e_situacional: row.e_situacional,
                                    predicted_value: file.predicted,
                                }
                            );
                            row.isDuplicate = respCheck.data.match_found === true;
                            console.log(
                                `[fetchAll] [${fileName}] isDuplicate:`,
                                row.isDuplicate
                            );
                        } catch (errCheck) {
                            console.error(
                                `[fetchAll] Error al chequear duplicado para ${fileName}:`,
                                errCheck
                            );
                            row.isDuplicate = false;
                        }
                    } else {
                        row.isDuplicate = false;
                    }

                    results.push(row);
                } catch (error) {
                    console.error(
                        `[fetchAll] Error al buscar registro PPU '${ppuExtracted}':`,
                        error
                    );
                }
            }

            console.log("[fetchAll] Resultados crudos:", results);

            // 2) Ordenar resultados
            let sortedResults = [];
            try {
                sortedResults = results.slice().sort((a, b) => {
                    const reSuffix = /\s+-\s+cop(?:ia|ias)$/i;
                    const removePdf = (n) => n.toLowerCase().replace(/\.pdf$/, "");
                    const getKey = (fileName) => {
                        let name = removePdf(fileName);
                        let dashCount = (name.match(/-/g) || []).length;
                        const hasCopy = reSuffix.test(name);
                        name = name.replace(reSuffix, "").trim();
                        return { name, dashCount, hasCopy };
                    };
                    const aData = getKey(a.fileName);
                    const bData = getKey(b.fileName);
                    const coll = new Intl.Collator(undefined, {
                        numeric: true,
                        sensitivity: "base",
                    });
                    const cmp = coll.compare(aData.name, bData.name);
                    if (cmp !== 0) return cmp;
                    if (aData.hasCopy !== bData.hasCopy) {
                        return aData.hasCopy ? -1 : 1;
                    }
                    return aData.dashCount - bData.dashCount;
                });
                console.log("[fetchAll] Resultados ordenados:", sortedResults);
            } catch (errSort) {
                console.error("[fetchAll] Error ordenando resultados:", errSort);
                sortedResults = results;
            }

            // 3) Sanitizar (reemplazar 'NA' por '')
            const sanitized = sortedResults.map((item) => {
                const copy = { ...item };
                Object.keys(copy).forEach((k) => {
                    if (copy[k] === "NA") copy[k] = "";
                });
                return copy;
            });
            console.log("[fetchAll] Resultados sanitizados:", sanitized);

            // 4) Actualizar estado
            setDatosMinimal(sanitized);
            console.log("[fetchAll] Estado datosMinimal ACTUALIZADO");
            setMostrarTablaMinimal(true);
            setSelectedCell({ row: 0, col: 0 });
            console.log("[fetchAll] mostrarTablaMinimal y selectedCell reiniciados");

            // 5) Limpiar lista de archivos para evitar re-procesar
            setPdfFiles([]);
            console.log("[fetchAll] pdfFiles limpiado para próxima carga");
        };

        fetchAll();
    }, [pdfFiles, API_BASE_URL, useML]);



    const columnsOrder = useMemo(() => {
        if (datosMinimal.length === 0) return [];
        const row = datosMinimal[0];
        const hiddenCols = [
            'id',
            'last_modified',
            'departamento',
            'fecha_de_archivo',
            'fecha_e_situacional',
            'fecha_ingreso',
            'informe_juridico',
            'item',
            'denunciado',
            'registro_ppu',
            'delito',
            'abogado',
            'juzgado',
            'origen',
            'nr de exp completo',
            'hash_sha',
            'seguimiento',
            'audiencia',
            'etiqueta'
        ];
        const minimalStaticColumns = [
            'fileName',
            'e_situacional',
            'accion',
            'plazo_atencion',
            'fecha_atencion',
            'ruta'
        ];
        const allKeys = Object.keys(row);
        const dynamicCols = allKeys.filter(
            (k) =>
                !hiddenCols.includes(k) &&
                !minimalStaticColumns.includes(k) &&
                k !== 'e_situacional' &&
                k !== 'fileName' &&
                k !== 'accion' &&
                k !== 'plazo_atencion' &&
                k !== 'fecha_atencion'
        );
        dynamicCols.sort();
        return [...minimalStaticColumns, ...dynamicCols.filter(col => col !== 'isduplicate')];
    }, [datosMinimal]);

    const handleMinimalChange = useCallback((rowIndex, field, value) => {
        setDatosMinimal((prev) => {
            const updated = [...prev];
            updated[rowIndex] = { ...updated[rowIndex], [field]: value };
            return updated;
        });
    }, []);

    const finishEditingCell = (rowIndex, col, oldVal, newVal) => {
        if (oldVal !== newVal) {
            setCeldasEditadas((prev) => ({ ...prev, [`${rowIndex}-${col}`]: true }));
        }
    };

    const row = datosMinimal[editRowIndex];


    const limpiarTabla = async () => {
        const ppus = datosMinimal.map((fila) => fila.registro_ppu);
        try {
            await axios.post(`${API_BASE_URL}/api/limpiar_pdfs_por_registros`, { ppus });
            setDatosMinimal([]);
            setCeldasEditadas({});
            setSelectedCell({ row: 0, col: 0 });
        } catch (error) {
            console.error('Error al limpiar PDFs:', error);
            alert('No se pudo limpiar los PDFs asociados.');
        }
    };

    const retirarFila = async (rowIndex) => {
        if (rowIndex < 0 || rowIndex >= datosMinimal.length) return;
        const fila = datosMinimal[rowIndex];
        const registro_ppu = fila.registro_ppu;
        try {
            await axios.post(`${API_BASE_URL}/api/eliminar_pdfs_por_registro`, { registro_ppu });
            const updatedDatos = datosMinimal.filter((_, index) => index !== rowIndex);
            setDatosMinimal(updatedDatos);
            if (selectedCell.row >= updatedDatos.length) {
                setSelectedCell({ row: updatedDatos.length - 1, col: selectedCell.col });
            }
        } catch (error) {
            console.error('Error al eliminar PDFs:', error);
            alert('No se pudo eliminar los PDFs asociados.');
        }
    };

    const toggleExpand = () => {
        setIsExpanded(!isExpanded);
    };

    const handleCellNavigation = useCallback((event, rowIndex, colIndex, col) => {
        const columns = vistaMinimal ? hoja1Columns : columnasMinimal;
        const isEditable = !nonEditableCols.includes(col) && !datePickerCols.includes(col);
        if (event.type === 'click') {
            if (selectedCell.row !== rowIndex || selectedCell.col !== colIndex) {
                setSelectedCell({ row: rowIndex, col: colIndex });
                setEditingCell(null);
            } else if (isEditable) {
                setEditingCell({
                    row: rowIndex,
                    col: colIndex,
                    initialValue: datosMinimal[rowIndex][col] || ''
                });
            }
        } else if (event.type === 'keydown') {
            if (editingCell && editingCell.row === rowIndex && editingCell.col === colIndex && event.key.startsWith('Arrow')) {
                return;
            }
            switch (event.key) {
                case 'ArrowUp':
                case 'ArrowDown':
                case 'ArrowLeft':
                case 'ArrowRight': {
                    event.preventDefault();
                    let newRow = rowIndex;
                    let newCol = colIndex;
                    if (event.key === 'ArrowUp') newRow = rowIndex - 1;
                    if (event.key === 'ArrowDown') newRow = rowIndex + 1;
                    if (event.key === 'ArrowLeft') newCol = colIndex - 1;
                    if (event.key === 'ArrowRight') newCol = colIndex + 1;
                    if (newRow >= 0 && newRow < datosMinimal.length && newCol >= 0 && newCol < columns.length) {
                        setSelectedCell({ row: newRow, col: newCol });
                    }
                    break;
                }
                case 'Escape': {
                    event.preventDefault();
                    const fila = datosMinimal[rowIndex];
                    const secureFilename = fila.ruta || fila.fileName;
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
                    break;
                }
                case 'Enter': {
                    event.preventDefault();
                    if (!editingCell || editingCell.row !== rowIndex || editingCell.col !== colIndex) {
                        if (isEditable) {
                            setEditingCell({
                                row: rowIndex,
                                col: colIndex,
                                initialValue: datosMinimal[rowIndex][col] || ''
                            });
                        }
                    } else {
                        setEditingCell(null);
                    }
                    break;
                }
                case '|': {
                    event.preventDefault();
                    setVistaMinimal(prev => !prev);
                    setSelectedCell({ row: 0, col: 0 });
                    break;
                }
                case '<':
                case '>': {
                    if (event.code === 'IntlBackslash') {
                        event.preventDefault();
                        toggleAudienciaBoth(rowIndex);
                        setTimeout(() => {
                            const cell = document.querySelector(`[data-cell="${rowIndex}-${colIndex}"]`);
                            if (cell) cell.focus();
                        }, 0);
                    }
                    break;
                }
                default:
                    break;
            }
        }
    }, [selectedCell, editingCell, vistaMinimal, hoja1Columns, columnasMinimal, nonEditableCols, datePickerCols, datosMinimal]);

    // Función unificada para alternar audiencia
    const toggleAudienciaBoth = (rowIndex) => {
        setDatosMinimal(prev => {
            const updated = [...prev];
            const nuevoValor = !updated[rowIndex].audiencia;
            updated[rowIndex] = { ...updated[rowIndex], audiencia: nuevoValor };
            // Si el modal está abierto y se edita la misma fila, actualizar el formulario
            if (editRowIndex === rowIndex) {
                setEditFormValues(prev => ({
                    ...prev,
                    audiencia: nuevoValor,
                    plazoTipo: nuevoValor ? 'AUDIENCIA' : 'REQUERIMIENTO'
                }));
            }
            return updated;
        });
    };


    const handleFinalizeEdit = () => {
        if (!validateEditModal()) return;

        // Verificar que editRowIndex sea válido y que exista la fila original
        if (editRowIndex === null || editRowIndex < 0 || editRowIndex >= datosMinimal.length) {
            alert("No se encontró la fila original.");
            return;
        }

        const originalRow = datosMinimal[editRowIndex];
        const fechaISO = parseDateFromDisplay(editFormValues.fecha_atencion); // string | null
        const fechaAtencionFinal = fechaISO ?? editFormValues.fecha_atencion;  // SIEMPRE lo que se va a guardar

        // ⬅️  NUEVO ► si el usuario digitó la fecha como “dd-MM-yyyy” la paso a ISO;
        //     si la caja está vacía conservo la cadena original («»)


        // Limpiar el campo "informacionEspecifica": remover cualquier ":" inicial y espacios
        const infoRaw = editESituacional.informacionEspecifica.trim();
        const infoLimpia = infoRaw.replace(/^:\s*/, "");

        // Verificar si se llenó alguno de los campos de notificación (excluyendo info específica)
        const hasNotificacionFields =
            editESituacional.tipoNotificacion.trim() !== "" ||
            editESituacional.numero.trim() !== "" ||
            (editESituacional.anio && editESituacional.anio.toString().trim() !== "") ||
            editESituacional.cuaderno.trim() !== "";

        // Preparar variables para construcción de e_situacional
        let nuevoESituacional = "";
        let numeroDisplay = "";

        if (modoModificacionPlazo) {
            // Si está activo el modo modificación de plazo, se conserva el valor original sin modificar
            nuevoESituacional = originalEditData?.e_situacional || "";
        } else {
            const tipoNot = editESituacional.tipoNotificacion;
            if (["DISPOSICIÓN", "RESOLUCIÓN", "PROVIDENCIA"].includes(tipoNot)) {
                const prefijo =
                    tipoNot === "DISPOSICIÓN" && editESituacional.superior
                        ? "DISPOSICIÓN SUPERIOR"
                        : tipoNot;
                numeroDisplay =
                    editESituacional.numero && editESituacional.numero !== "S/N"
                        ? `N° ${editESituacional.numero}`
                        : editESituacional.numero || "";
                nuevoESituacional =
                    `${prefijo} ${numeroDisplay}-${editESituacional.anio || ""}` +
                    `${editESituacional.cuaderno ? " DEL CUADERNO " + editESituacional.cuaderno : ""}` +
                    `${hasNotificacionFields && infoLimpia ? " : " + infoLimpia : ""}`;
            } else if (tipoNot === "ACTA") {
                const actaPart = editESituacional.tipoActa ? ` (${editESituacional.tipoActa})` : "";
                const cuadernoPart =
                    editESituacional.tieneCuaderno === "SI" && editESituacional.cuaderno
                        ? ` DEL CUADERNO ${editESituacional.cuaderno}`
                        : "";
                nuevoESituacional =
                    `${tipoNot}${actaPart}` +
                    `${cuadernoPart}` +
                    `${hasNotificacionFields && infoLimpia ? " : " + infoLimpia : ""}`;
            } else if (tipoNot === "OTROS") {
                nuevoESituacional =
                    `${tipoNot}` +
                    `${editESituacional.numero ? " " + editESituacional.numero : ""}` +
                    `${hasNotificacionFields && infoLimpia ? " : " + infoLimpia : ""}`;
            } else if (["OFICIO", "CITACIÓN POLICIAL"].includes(tipoNot)) {
                numeroDisplay =
                    editESituacional.numero && editESituacional.numero !== "S/N"
                        ? `N° ${editESituacional.numero}`
                        : editESituacional.numero || "";
                nuevoESituacional =
                    `${tipoNot} ${numeroDisplay}-${editESituacional.anio || ""}` +
                    `${editESituacional.lugar ? " LUGAR " + editESituacional.lugar : ""}` +
                    `${hasNotificacionFields && infoLimpia ? " : " + infoLimpia : ""}`;
            } else {
                numeroDisplay =
                    editESituacional.numero && editESituacional.numero !== "S/N"
                        ? `N°${editESituacional.numero}`
                        : editESituacional.numero || "";
                nuevoESituacional =
                    `${tipoNot}` +
                    `${numeroDisplay ? " " + numeroDisplay : ""}` +
                    `${hasNotificacionFields && infoLimpia ? " : " + infoLimpia : ""}`;
            }
        }

        if (editFormValues.plazoTipo === "AMBOS") {
            // En modo AMBOS se utilizan dos campos separados para Acción
            const accionAudienciaFinal =
                editFormValues.reprogramacion === "SI" && editFormValues.accionAudiencia.trim() !== ""
                    ? editFormValues.accionAudiencia.endsWith(" -REPROGRAMADA")
                        ? editFormValues.accionAudiencia
                        : editFormValues.accionAudiencia + " -REPROGRAMADA"
                    : editFormValues.accionAudiencia;
            const accionRequerimientoFinal = editFormValues.accionRequerimiento;

            if (!editFormValues.audiencia) {
                toggleAudienciaBoth(editRowIndex);
            }

            const audienciaPlazo = [editFormValues.plazo_fecha, editFormValues.plazo_hora, editFormValues.AmPm]
                .filter(v => Boolean(v))
                .join(' ')
                .toUpperCase();
            const requerimientoPlazo = editFormValues.plazo_atencion;

            // Actualizar celdas para AUDIENCIA
            if (originalRow.plazo_atencion !== audienciaPlazo) {
                setCeldasEditadas(prev => ({ ...prev, [`${editRowIndex}-plazo_atencion`]: true }));
            }
            if (originalRow.e_situacional !== nuevoESituacional) {
                setCeldasEditadas(prev => ({ ...prev, [`${editRowIndex}-e_situacional`]: true }));
            }
            if (originalRow.accion !== accionAudienciaFinal) {
                setCeldasEditadas(prev => ({ ...prev, [`${editRowIndex}-accion`]: true }));
            }
            if (originalRow.fecha_atencion !== (fechaISO || editFormValues.fecha_atencion)) {
                setCeldasEditadas(prev => ({ ...prev, [`${editRowIndex}-fecha_atencion`]: true }));
            }
            if (originalRow.denunciado !== editFormValues.denunciado) {
                setCeldasEditadas(prev => ({ ...prev, [`${editRowIndex}-denunciado`]: true }));
            }
            if (originalRow.documentType !== editFormValues.documentType) {
                setCeldasEditadas(prev => ({ ...prev, [`${editRowIndex}-documentType`]: true }));
            }

            // Actualizar celdas para REQUERIMIENTO
            if (originalRow.plazo_atencion !== requerimientoPlazo) {
                setCeldasEditadas(prev => ({ ...prev, [`${editRowIndex + 1}-plazo_atencion`]: true }));
            }
            if (originalRow.accion !== accionRequerimientoFinal) {
                setCeldasEditadas(prev => ({ ...prev, [`${editRowIndex + 1}-accion`]: true }));
            }
            if (originalRow.e_situacional !== nuevoESituacional) {
                setCeldasEditadas(prev => ({ ...prev, [`${editRowIndex + 1}-e_situacional`]: true }));
            }
            if (originalRow.fecha_atencion !== (fechaISO || editFormValues.fecha_atencion)) {
                setCeldasEditadas(prev => ({ ...prev, [`${editRowIndex + 1}-fecha_atencion`]: true }));
            }
            if (originalRow.denunciado !== editFormValues.denunciado) {
                setCeldasEditadas(prev => ({ ...prev, [`${editRowIndex + 1}-denunciado`]: true }));
            }
            if (originalRow.documentType !== editFormValues.documentType) {
                setCeldasEditadas(prev => ({ ...prev, [`${editRowIndex + 1}-documentType`]: true }));
            }

            const newRowAudiencia = {
                ...originalRow,
                e_situacional: nuevoESituacional,
                accion: accionAudienciaFinal,
                plazo_atencion: audienciaPlazo,
                tipoPlazo: "AUDIENCIA",
                fecha_atencion: fechaAtencionFinal,
                denunciado: editFormValues.denunciado,
                documentType: editFormValues.documentType,
                audiencia: true,
            };
            const newRowRequerimiento = {
                ...originalRow,
                e_situacional: nuevoESituacional,
                accion: accionRequerimientoFinal,
                plazo_atencion: requerimientoPlazo,
                tipoPlazo: "REQUERIMIENTO",
                fecha_atencion: fechaAtencionFinal,
                denunciado: editFormValues.denunciado,
                documentType: editFormValues.documentType,
                audiencia: false,
            };
            setDatosMinimal(prev => {
                const updated = [...prev];
                updated.splice(editRowIndex, 1, newRowAudiencia, newRowRequerimiento);
                return updated;
            });
        } else if (editFormValues.plazoTipo === "AUDIENCIA") {
            if (!row.audiencia) {
                toggleAudienciaBoth(editRowIndex);
            }
            const accionFinalLocal =
                editFormValues.reprogramacion === "SI" && editFormValues.accion.trim() !== ""
                    ? editFormValues.accion.endsWith(" -REPROGRAMADA")
                        ? editFormValues.accion
                        : editFormValues.accion + " -REPROGRAMADA"
                    : editFormValues.accion;
            const nuevoAudiencia = [editFormValues.plazo_fecha, editFormValues.plazo_hora, editFormValues.AmPm]
                .filter(v => typeof v === 'string' && v.trim() !== '')
                .join(' ')
                .toUpperCase();

            if (originalRow.plazo_atencion !== nuevoAudiencia) {
                setCeldasEditadas(prev => ({ ...prev, [`${editRowIndex}-plazo_atencion`]: true }));
            }
            handleMinimalChange(editRowIndex, "plazo_atencion", nuevoAudiencia);

            if (originalRow.tipoPlazo !== "AUDIENCIA") {
                setCeldasEditadas(prev => ({ ...prev, [`${editRowIndex}-tipoPlazo`]: true }));
            }
            handleMinimalChange(editRowIndex, "tipoPlazo", "AUDIENCIA");

            if (originalRow.e_situacional !== nuevoESituacional) {
                setCeldasEditadas(prev => ({ ...prev, [`${editRowIndex}-e_situacional`]: true }));
            }
            handleMinimalChange(editRowIndex, "e_situacional", nuevoESituacional);

            if (originalRow.accion !== accionFinalLocal) {
                setCeldasEditadas(prev => ({ ...prev, [`${editRowIndex}-accion`]: true }));
            }
            handleMinimalChange(editRowIndex, "accion", accionFinalLocal);

            if (originalRow.fecha_atencion !== fechaAtencionFinal) {
                setCeldasEditadas(prev => ({ ...prev, [`${editRowIndex}-fecha_atencion`]: true }));
            }
            handleMinimalChange(editRowIndex, 'fecha_atencion', fechaAtencionFinal);


            if (originalRow.denunciado !== editFormValues.denunciado) {
                setCeldasEditadas(prev => ({ ...prev, [`${editRowIndex}-denunciado`]: true }));
            }
            handleMinimalChange(editRowIndex, "denunciado", editFormValues.denunciado);

            if (originalRow.documentType !== editFormValues.documentType) {
                setCeldasEditadas(prev => ({ ...prev, [`${editRowIndex}-documentType`]: true }));
            }
            handleMinimalChange(editRowIndex, "documentType", editFormValues.documentType);
        } else {
            // Modo REQUERIMIENTO individual
            if (originalRow.audiencia !== false) {
                setDatosMinimal(prev => {
                    const updated = [...prev];
                    updated[editRowIndex] = { ...updated[editRowIndex], audiencia: false };
                    return updated;
                });
            }
            if (originalRow.plazo_atencion !== editFormValues.plazo_atencion) {
                setCeldasEditadas(prev => ({ ...prev, [`${editRowIndex}-plazo_atencion`]: true }));
            }
            handleMinimalChange(editRowIndex, "plazo_atencion", editFormValues.plazo_atencion);

            if (originalRow.tipoPlazo !== "REQUERIMIENTO") {
                setCeldasEditadas(prev => ({ ...prev, [`${editRowIndex}-tipoPlazo`]: true }));
            }
            handleMinimalChange(editRowIndex, "tipoPlazo", "REQUERIMIENTO");

            if (originalRow.e_situacional !== nuevoESituacional) {
                setCeldasEditadas(prev => ({ ...prev, [`${editRowIndex}-e_situacional`]: true }));
            }
            handleMinimalChange(editRowIndex, "e_situacional", nuevoESituacional);

            if (originalRow.accion !== editFormValues.accion) {
                setCeldasEditadas(prev => ({ ...prev, [`${editRowIndex}-accion`]: true }));
            }
            handleMinimalChange(editRowIndex, "accion", editFormValues.accion);

            if (originalRow.fecha_atencion !== (fechaISO || editFormValues.fecha_atencion)) {
                setCeldasEditadas(prev => ({ ...prev, [`${editRowIndex}-fecha_atencion`]: true }));
            }
            handleMinimalChange(editRowIndex, "fecha_atencion", fechaISO || editFormValues.fecha_atencion);

            if (originalRow.denunciado !== editFormValues.denunciado) {
                setCeldasEditadas(prev => ({ ...prev, [`${editRowIndex}-denunciado`]: true }));
            }
            handleMinimalChange(editRowIndex, "denunciado", editFormValues.denunciado);

            if (originalRow.documentType !== editFormValues.documentType) {
                setCeldasEditadas(prev => ({ ...prev, [`${editRowIndex}-documentType`]: true }));
            }
            handleMinimalChange(editRowIndex, "documentType", editFormValues.documentType);
        }

        closeEditModal();
    };




    const [fiscaliaOptionsTable] = useState([]);
    const fetchFiscaliasTable = useCallback(
        debounce(async () => {
            // Función para buscar fiscalías
        }, 500),
        []
    );
    const [inputValues, setInputValues] = useState({});
    const [nuevoCaso, setNuevoCaso] = useState({});

    const handleFiscaliaChange = (event, newValue) => {
        if (newValue) {
            setNuevoCaso((prev) => ({
                ...prev,
                fiscalia: newValue.fiscalia,
                departamento: newValue.departamento,
                'nr de exp completo': newValue.nr_de_exp_completo + '-'
            }));
        } else {
            setNuevoCaso((prev) => ({
                ...prev,
                fiscalia: '',
                departamento: '',
                'nr de exp completo': ''
            }));
        }
    };

    const actualizarMinimal = async () => {
        try {
            const data = { registros: datosMinimal };
            await axios.post(`${API_BASE_URL}/api/bulk_update`, data);
            alert('Actualización completada.');
            setMostrarTablaMinimal(false);
            setDatosMinimal([]);
            setCeldasEditadas({});
        } catch (error) {
            console.error('Error:', error);
            alert(`Error: ${error.response?.data?.error || error.message}`);
        }
    };

    const renderCellContent = (row, col, rindex, cindex) => {
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
        if (col === 'fecha_atencion') {
            // Si el registro corresponde a AUDIENCIA y no está activo, deshabilitar la edición
            const isAudiencia = row.tipoPlazo === 'AUDIENCIA';
            const currentDateValue = row.fecha_atencion
                ? new Date(`${row.fecha_atencion}T00:00:00`)  // fuerza local
                : null;
            return (
                <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={es}>
                    <DesktopDatePicker
                        inputFormat="dd-MM-yyyy"
                        value={currentDateValue}
                        onChange={(date) => {
                            if (isAudiencia && row.audiencia) {
                                const isoString = date ? date.toISOString() : '';
                                const oldVal = row.fecha_atencion || '';
                                handleMinimalChange(rindex, 'fecha_atencion', isoString);
                                finishEditingCell(rindex, 'fecha_atencion', oldVal, isoString);
                            }
                        }}
                        renderInput={(params) => <TextField {...params} variant="standard" disabled={isAudiencia && !row.audiencia} />}
                    />
                </LocalizationProvider>
            );
        }

        if (col === 'plazo_atencion') {
            const oldVal = row.plazo_atencion || '';
            if (editingCell && editingCell.row === rindex && editingCell.col === cindex) {
                if (row.audiencia) {
                    // Se emplea lógica para modo audiencia (formato combinado)
                    // Se emplea validación mediante regex
                    const plazoRegex =
                        /^(0?[1-9]|[12][0-9]|3[01])-(0?[1-9]|1[0-2])-(\d{4})\s(0?[1-9]|1[0-2]):([0-5][0-9])\s(AM|PM)$/;
                    const cellIdentity = `${rindex}-${cindex}`;
                    const cellValues = editingValues[cellIdentity] || {
                        editDate: '',
                        editTime: '',
                        editAmPm: '',
                        activeSubField: 'date'
                    };
                    if (!editingValues[cellIdentity] && plazoRegex.test(row[col] || '')) {
                        const matchRegex = (row[col] || '').match(plazoRegex);
                        setEditingValues((prev) => ({
                            ...prev,
                            [cellIdentity]: {
                                editDate: `${matchRegex[1]}-${matchRegex[2]}-${matchRegex[3]}`,
                                editTime: `${matchRegex[4]}:${matchRegex[5]}`,
                                editAmPm: matchRegex[6],
                                activeSubField: 'date'
                            }
                        }));
                    }
                    const combinedValue = `${cellValues.editDate} ${cellValues.editTime} ${cellValues.editAmPm}`.trim();
                    const isValidFormat = plazoRegex.test(combinedValue);
                    const saveValue = () => {
                        const localCellVals = editingValues[cellIdentity] || {
                            editDate: '',
                            editTime: '',
                            editAmPm: '',
                            activeSubField: 'date'
                        };
                        const currentCombined = `${localCellVals.editDate} ${localCellVals.editTime} ${localCellVals.editAmPm}`.trim();
                        if (plazoRegex.test(currentCombined)) {
                            handleMinimalChange(rindex, 'plazo_atencion', currentCombined.toUpperCase());
                            finishEditingCell(rindex, 'plazo_atencion', oldVal, currentCombined.toUpperCase());
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
                                helperText={!isValidFormat ? 'Inválido' : ''}
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
                                helperText={!isValidFormat ? 'Inválido' : ''}
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
                                helperText={!/^([AP])M$/.test(cellValues.editAmPm) ? 'Inválido' : ''}
                                onKeyDown={handleKeyDown}
                                autoFocus={cellValues.activeSubField === 'ampm'}
                            />
                        </Box>
                    );
                } else {
                    const [localValue, setLocalValue] = useState(oldVal);
                    const firstFocusRef = useRef(true);
                    return (
                        <TextField
                            value={localValue}
                            onChange={(e) => {
                                const numericValue = e.target.value.replace(/\D/g, '');
                                setLocalValue(numericValue);
                            }}
                            size="small"
                            variant="standard"
                            fullWidth
                            autoFocus
                            inputProps={{
                                inputMode: 'numeric',
                                pattern: '[0-9]*'
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
                                    finishEditingCell(rindex, col, oldVal, localValue);
                                } else if (e.key === 'ArrowUp') {
                                    setLocalValue((prev) => (prev ? `${parseInt(prev, 10) + 1}` : '1'));
                                } else if (e.key === 'ArrowDown') {
                                    setLocalValue((prev) => {
                                        const numVal = prev ? parseInt(prev, 10) : 0;
                                        return numVal > 0 ? `${numVal - 1}` : '0';
                                    });
                                }
                            }}
                            onBlur={() => {
                                handleMinimalChange(rindex, col, localValue);
                                finishEditingCell(rindex, col, oldVal, localValue);
                            }}
                        />
                    );
                }
            } else {
                return <Typography variant="body2">{oldVal}</Typography>;
            }
        }
        if (col === 'accion' || col === 'e_situacional') {
            const oldVal = row[col] || '';
            if (editingCell && editingCell.row === rindex && editingCell.col === cindex) {
                const [localValue, setLocalValue] = useState(oldVal);
                const inputRef = useRef(null);
                const firstFocusRef = useRef(true);
                const [cursorMoved, setCursorMoved] = useState(false);
                const saveValue = () => {
                    handleMinimalChange(rindex, col, localValue);
                    finishEditingCell(rindex, col, oldVal, localValue);
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
                            setCursorMoved(true);
                        }}
                        size="small"
                        variant="standard"
                        fullWidth
                        multiline={col === 'e_situacional'}
                        rows={col === 'e_situacional' ? 4 : 1}
                        autoFocus
                        onFocus={(e) => {
                            if (firstFocusRef.current && !cursorMoved) {
                                e.target.select();
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
                            width: col === 'accion' ? '150px' : '100%'
                        }}
                    />
                );
            } else {
                return (
                    <Box display="flex" alignItems="center">
                        <Typography variant="body2" style={{ wordBreak: 'break-word', flexGrow: 1 }}>
                            {oldVal}
                        </Typography>
                        {col === 'e_situacional' &&
                            Array.isArray(historialCache[row.registro_ppu]) &&
                            historialCache[row.registro_ppu].length > 0 && (
                                <IconButton
                                    size="small"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const historial = historialCache[row.registro_ppu];
                                        setSelectedRegistroPPU(row.registro_ppu);
                                        setHistorialData(historial);
                                        setOpenHistorialMinimal(true);
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
        if (col === 'fiscalia') {
            if (editingCell && editingCell.row === rindex && editingCell.col === cindex) {
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
                        onFinishEditing={(newVal) => finishEditingCell(rindex, 'fiscalia', oldVal, newVal)}
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
        if (editingCell && editingCell.row === rindex && editingCell.col === cindex && !nonEditableCols.includes(col)) {
            const oldVal = row[col] || '';
            const [localValue, setLocalValue] = useState(oldVal);
            const firstFocusRef = useRef(true);
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
                            finishEditingCell(rindex, col, oldVal, localValue);
                        }
                    }}
                    onBlur={(e) => {
                        handleMinimalChange(rindex, col, localValue);
                        finishEditingCell(rindex, col, oldVal, localValue);
                    }}
                />
            );
        }
        return (
            <Typography variant="body2" style={{ wordBreak: 'break-word' }}>
                {row[col] || ''}
            </Typography>
        );
    };

    // Precarga de historiales
    useEffect(() => {
        if (datosMinimal.length === 0) return;
        const ppusNuevos = Array.from(
            new Set(
                datosMinimal
                    .map((row) => row.registro_ppu)
                    .filter((ppu) => !(ppu in historialCache))
            )
        );
        if (ppusNuevos.length > 0) {
            axios
                .post(`${API_BASE_URL}/api/historiales`, { registro_ppu: ppusNuevos })
                .then((response) => {
                    setHistorialCache((prevCache) => {
                        const nuevos = {};
                        ppusNuevos.forEach((ppu) => {
                            nuevos[ppu] = response.data.historiales?.[ppu] || [];
                        });
                        return { ...prevCache, ...nuevos };
                    });
                })
                .catch((error) => {
                    console.error('Error al precargar historiales:', error);
                });
        }
    }, [datosMinimal, API_BASE_URL, historialCache]);

    // Se asume que originalEditData se declaró previamente, por ejemplo:
    // const [originalEditData, setOriginalEditData] = useState(null);

    // Función auxiliar opcional para extraer los campos de e_situacional
    // Debe ajustarse al formato real de dicho campo.
    const parseESituacional = (esString) => {
        if (!esString) return { tipoNotificacion: '', numero: '', cuaderno: '', informacionEspecifica: '' };
        const parts = esString.split(':');
        if (parts.length > 1) {
            const leftParts = parts[0].split('N°');
            const tipoNotificacion = leftParts[0].trim();
            let numero = '', cuaderno = '';
            if (leftParts.length > 1) {
                const numAndCuaderno = leftParts[1].split('-');
                numero = numAndCuaderno[0] ? numAndCuaderno[0].trim() : '';
                cuaderno = numAndCuaderno[1] ? numAndCuaderno[1].trim() : '';
            }
            const informacionEspecifica = parts[1].trim();
            return { tipoNotificacion, numero, cuaderno, informacionEspecifica };
        }
        return { tipoNotificacion: '', numero: '', cuaderno: '', informacionEspecifica: '' };
    };

    const handleCloseEditModal = () => {
        // Cierra el modal sin actualizar la información en la tabla,
        // de modo que todo permanezca igual a como estaba.
        setOpenEditModal(false);

        if (originalEditData) {
            // Restaurar los campos del formulario a sus valores originales.
            setEditFormValues({
                e_situacional: originalEditData.e_situacional || '',
                accion: originalEditData.accion || '',
                accionAudiencia: originalEditData.accionAudiencia || '',
                accionRequerimiento: originalEditData.accionRequerimiento || '',
                plazo_atencion: originalEditData.plazo_atencion || '',
                fecha_atencion: originalEditData.fecha_atencion || '',
                denunciado: originalEditData.denunciado || '',
                audiencia: originalEditData.audiencia || false
            });
            // Restaurar el estado de e_situacional a partir del valor original
            const parsedES = parseESituacional(originalEditData.e_situacional);
            setEditESituacional({
                tipoNotificacion: parsedES.tipoNotificacion,
                numero: parsedES.numero,
                cuaderno: parsedES.cuaderno,
                informacionEspecifica: parsedES.informacionEspecifica
            });
        }
    };



    // Función del botón multifunción
    const handleMultiFunctionButtonClick = (rowIndex) => {
        // Almacenar el índice de la fila que dispara la acción
        lastActionRowRef.current = rowIndex;
        const row = datosMinimal[rowIndex];
        if (!row) return;
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


        // Guardar los datos originales de la fila para usarlos como memoria
        setOriginalEditData({ ...row });
        // Inicializar los estados del modal con los valores actuales de la fila
        setEditFormValues({
            e_situacional: row.e_situacional || '',
            accion: row.accion || '',
            plazo_atencion: row.plazo_atencion || '',
            fecha_atencion: row.fecha_atencion || '',
            denunciado: row.denunciado || '',
            audiencia: row.audiencia,
            plazoTipo: row.audiencia ? 'AUDIENCIA' : 'REQUERIMIENTO'
        });

        // Se inicializa editESituacional, pudiendo ajustarse para tomar valores originales si se requiere
        setEditESituacional({
            tipoNotificacion: '',
            numero: '',
            cuaderno: '',
            informacionEspecifica: row.e_situacional
        });

        setEditRowIndex(rowIndex);
        setOpenEditModal(true);
    };



    const closeEditModal = () => {
        setOpenEditModal(false);
        setEditingCell(null);
        setTimeout(() => {
            // Se selecciona la celda de la columna "accion" (índice 2) en la fila indicada
            const cell = document.querySelector(`[data-cell="${lastActionRowRef.current}-2"]`);
            if (cell) cell.focus();
        }, 0);
    };

    const MinimalTableRow = memo(function MinimalTableRow({
        row,
        rindex,
        columns,
        selectedCell,
        editingCell,
        setSelectedCell,
        setEditingCell,
        toggleAudienciaBoth,
        renderCellContent,
        handleCellNavigation
    }) {
        return (
            <TableRow key={rindex} hover>
                {columns.map((col, cindex) => (
                    <TableCell
                        key={cindex}
                        data-cell={`${rindex}-${cindex}`}
                        className={`tabla-minima-cell 
        ${selectedCell.row === rindex && selectedCell.col === cindex ? 'selected-cell' : ''} 
        ${editingCell && editingCell.row === rindex && editingCell.col === cindex ? 'editing-cell' : ''} 
        ${celdasEditadas[`${rindex}-${col}`] ? 'edited-cell' : ''}`}
                        tabIndex={0}
                        onClick={(e) => handleCellNavigation(e, rindex, cindex, col)}
                        onKeyDown={(e) => handleCellNavigation(e, rindex, cindex, col)}
                    >
                        {renderCellContent(row, col, rindex, cindex)}
                    </TableCell>
                ))}
                <TableCell className="tabla-minima-cell">
                    <Button
                        variant="contained"
                        color="primary"
                        size="small"
                        onClick={() => handleMultiFunctionButtonClick(rindex)}
                        style={{ padding: '2px 6px' }}
                    >
                        Acciones
                    </Button>
                </TableCell>
                <TableCell className="tabla-minima-cell">
                    <Button
                        variant={row.audiencia ? 'contained' : 'outlined'}
                        color="primary"
                        size="small"
                        onClick={() => toggleAudienciaBoth(rindex)}
                        style={{ padding: '2px 6px' }}
                    >
                        {row.audiencia ? 'Audiencia' : 'Marcar'}
                    </Button>
                </TableCell>
            </TableRow>
        );
    });

    return (
        <>
            {/* ------------------------------------------------ LOADER GLOBAL */}
            {loading && (
                <Backdrop
                    open
                    sx={{ color: '#fff', zIndex: (theme) => theme.zIndex.drawer + 1 }}
                >
                    <CircularProgress color="inherit" />
                    <Typography sx={{ ml: 2 }}>{loadingMsg}</Typography>
                </Backdrop>
            )}
            {/* -------------------------------------------------------------- */}

            {role === 'admin' && tab === 2 && isLoggedIn && (
                <>
                    <Box mb={2}>
                        <Box {...getRootProps()} className="dropzone">
                            <input {...getInputProps()} />
                            {isDragActive ? (
                                <Typography>Soltar archivos aquí...</Typography>
                            ) : (
                                <Typography>
                                    Arrastrar y soltar varios PDFs, o hacer clic para seleccionar.
                                </Typography>
                            )}
                        </Box>
                        {pdfFiles.length > 0 && (
                            <Box mt={2}>
                                <Typography variant="subtitle1">
                                    Archivos seleccionados: {pdfFiles.length}
                                </Typography>
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
                            style={
                                isExpanded ? styles.expandedContainer : { padding: '10px', marginBottom: '20px' }
                            }
                        >
                            {isExpanded ? (
                                <Button
                                    variant="contained"
                                    color="secondary"
                                    onClick={toggleExpand}
                                    style={{ marginBottom: '10px' }}
                                >
                                    Cerrar Modo Expandido
                                </Button>
                            ) : (
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
                                        Seleccione celdas, use flechas y presione Enter para editar.
                                    </Typography>
                                </>
                            )}
                            <Box display="flex" justifyContent="flex-end" mb={1}>
                                <Button variant="text" onClick={() => setVistaMinimal(!vistaMinimal)}>
                                    {vistaMinimal ? 'VER HOJA 2' : 'VER HOJA 1'}
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
                                    style={{ width: '100%' }}
                                >
                                    <TableHead>
                                        <TableRow>
                                            {(vistaMinimal ? hoja1Columns : columnasMinimal).map((col, cindex) => (
                                                <TableCell
                                                    key={cindex}
                                                    className={`tabla-minima-header ${col === 'e_situacional' ? 'e-situacional' : ''}`}
                                                    style={col === 'e_situacional' ? eSituacionalStyle : {}}
                                                >
                                                    {col}
                                                </TableCell>
                                            ))}
                                            <TableCell key="acciones" className="tabla-minima-header">
                                                Acciones
                                            </TableCell>
                                            <TableCell key="audiencia" className="tabla-minima-header">
                                                Audiencia
                                            </TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {datosMinimal.map((row, rindex) => {
                                            const columns = vistaMinimal ? hoja1Columns : columnasMinimal;
                                            return (
                                                <MinimalTableRow
                                                    key={rindex}
                                                    row={row}
                                                    rindex={rindex}
                                                    columns={columns}
                                                    selectedCell={selectedCell}
                                                    editingCell={editingCell}
                                                    setSelectedCell={setSelectedCell}
                                                    setEditingCell={setEditingCell}
                                                    toggleAudienciaBoth={toggleAudienciaBoth}
                                                    renderCellContent={renderCellContent}
                                                    handleCellNavigation={handleCellNavigation}
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
                                <Button variant="contained" color="secondary" onClick={limpiarTabla}>
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
            <Modal
                open={openHistorialMinimal}
                onClose={() => {
                    setOpenHistorialMinimal(false);
                    setHistorialData([]);
                }}
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
                        overflowY: 'auto'
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
                                                            `${API_BASE_URL}/api/descargar_pdf?ruta=${encodeURIComponent(
                                                                entry.ruta
                                                            )}`,
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
                        <Typography>No se encontró historial con PDF para este registro.</Typography>
                    )}
                </Box>
            </Modal>
            {/* Modal de edición */}
            {openEditModal && editRowIndex !== null && (
                <Modal open={openEditModal} onClose={() => setOpenEditModal(false)} disablePortal>
                    <Box
                        sx={{
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            bgcolor: 'background.paper',
                            zIndex: 1300,
                            overflow: 'auto'
                        }}
                    >

                        <Box display="flex" flexDirection="row" height="100%">
                            {/* Columna izquierda: Formulario */}
                            <Box
                                flex={1}
                                p={2}
                                borderRight="1px solid #ccc"
                                overflow="auto"
                                sx={{ maxHeight: 'calc(100vh - 50px)' }}
                            >
                                <Button
                                    variant="outlined"
                                    onClick={() => setModoModificacionPlazo(!modoModificacionPlazo)}
                                    style={{ marginBottom: '10px' }}
                                >
                                    MODO MODIFICACION DE PLAZO
                                </Button>
                                {/* Título del modal */}
                                <Typography variant="h6" gutterBottom>
                                    {editModalTitle}
                                </Typography>
                                <Typography variant="subtitle1" gutterBottom>
                                    e_situacional
                                </Typography>
                                <TextField
                                    label="Tipo de Notificación"
                                    select
                                    fullWidth
                                    variant="standard"
                                    margin="normal"
                                    value={editESituacional.tipoNotificacion}
                                    disabled={modoModificacionPlazo}
                                    onChange={(e) =>
                                        setEditESituacional((prev) => ({
                                            ...prev,
                                            tipoNotificacion: e.target.value,
                                            numero: '',
                                            anio: '',
                                            cuaderno: '',
                                            lugar: '',
                                            tipoActa: '',
                                            tieneCuaderno: 'NO'
                                        }))
                                    }
                                    SelectProps={{ native: true }}
                                >

                                    <option value=""></option>
                                    <option value="RESOLUCIÓN">RESOLUCIÓN</option>
                                    <option value="DISPOSICIÓN">DISPOSICIÓN</option>
                                    <option value="PROVIDENCIA">PROVIDENCIA</option>
                                    <option value="OFICIO">OFICIO</option>
                                    <option value="CITACIÓN POLICIAL">CITACIÓN POLICIAL</option>
                                    <option value="CEDULA">CEDULA</option>
                                    <option value="ACTA">ACTA</option>
                                    <option value="OTROS">OTROS</option>
                                </TextField>

                                {editESituacional.tipoNotificacion === 'OTROS' ? (
                                    <TextField
                                        label="Título Exacto"
                                        placeholder="COPIAR Y PEGAR TÍTULO EXACTO"
                                        fullWidth
                                        variant="standard"
                                        margin="normal"
                                        value={editESituacional.numero}
                                        disabled={modoModificacionPlazo}
                                        onChange={(e) =>
                                            !modoModificacionPlazo && setEditESituacional((prev) => ({
                                                ...prev,
                                                numero: e.target.value
                                            }))
                                        }
                                    />
                                ) : editESituacional.tipoNotificacion === 'ACTA' ? (
                                    <>
                                        <TextField
                                            label="Tipo de Acta"
                                            fullWidth
                                            variant="standard"
                                            margin="normal"
                                            value={editESituacional.tipoActa}
                                            disabled={modoModificacionPlazo}
                                            onChange={(e) =>
                                                !modoModificacionPlazo && setEditESituacional((prev) => ({
                                                    ...prev,
                                                    tipoActa: e.target.value
                                                }))
                                            }
                                        />
                                        <FormControl component="fieldset" margin="normal" disabled={modoModificacionPlazo}>
                                            <FormLabel component="legend">¿Tiene Cuaderno?</FormLabel>
                                            <RadioGroup
                                                row
                                                value={editESituacional.tieneCuaderno || 'NO'}
                                                onChange={(e) =>
                                                    !modoModificacionPlazo && setEditESituacional((prev) => ({
                                                        ...prev,
                                                        tieneCuaderno: e.target.value
                                                    }))
                                                }
                                            >
                                                <FormControlLabel value="SI" control={<Radio disabled={modoModificacionPlazo} />} label="Sí" />
                                                <FormControlLabel value="NO" control={<Radio disabled={modoModificacionPlazo} />} label="No" />
                                            </RadioGroup>
                                        </FormControl>
                                        {editESituacional.tieneCuaderno === 'SI' && (
                                            <TextField
                                                label="Cuaderno"
                                                type="number"
                                                fullWidth
                                                variant="standard"
                                                margin="normal"
                                                value={editESituacional.cuaderno}
                                                disabled={modoModificacionPlazo}
                                                onChange={(e) =>
                                                    !modoModificacionPlazo && setEditESituacional((prev) => ({
                                                        ...prev,
                                                        cuaderno: e.target.value
                                                    }))
                                                }
                                            />
                                        )}
                                    </>
                                    ) : editESituacional.tipoNotificacion === 'OFICIO' || editESituacional.tipoNotificacion === 'CITACIÓN POLICIAL' ? (
                                        <>
                                            <TextField
                                                label="Número"
                                                type="number"
                                                fullWidth
                                                variant="standard"
                                                margin="normal"
                                                value={editESituacional.numero}
                                                disabled={modoModificacionPlazo}
                                                onChange={e =>
                                                    !modoModificacionPlazo && setEditESituacional(prev => ({
                                                        ...prev,
                                                        numero: e.target.value
                                                    }))
                                                }
                                            />
                                            <TextField
                                                label="Año"
                                                type="number"
                                                fullWidth
                                                variant="standard"
                                                margin="normal"
                                                value={editESituacional.anio || ''}
                                                disabled={modoModificacionPlazo}
                                                onChange={e =>
                                                    !modoModificacionPlazo && setEditESituacional(prev => ({
                                                        ...prev,
                                                        anio: e.target.value
                                                    }))
                                                }
                                            />
                                            <TextField
                                                label="Lugar"
                                                fullWidth
                                                variant="standard"
                                                margin="normal"
                                                value={editESituacional.lugar || ''}
                                                disabled={modoModificacionPlazo}
                                                onChange={e =>
                                                    !modoModificacionPlazo && setEditESituacional(prev => ({
                                                        ...prev,
                                                        lugar: e.target.value
                                                        }))
                                            }
                                        />
                                    </>
                                ) : (
                                                <>
                                                    {editESituacional.tipoNotificacion === 'DISPOSICIÓN' ? (
                                                        <Box display="flex" alignItems="center" gap={1}>
                                                            <TextField
                                                                label="Número"
                                                                type="text"
                                                                fullWidth
                                                                variant="standard"
                                                                margin="normal"
                                                                value={editESituacional.numero}
                                                                disabled={modoModificacionPlazo || editESituacional.sinNumero}
                                                                InputProps={{
                                                                    startAdornment: !editESituacional.sinNumero && (
                                                                        <InputAdornment position="start">N°</InputAdornment>
                                                                    ),
                                                                }}
                                                                onChange={(e) =>
                                                                    !modoModificacionPlazo &&
                                                                    setEditESituacional(prev => ({
                                                                        ...prev,
                                                                        numero: e.target.value,
                                                                        sinNumero: false,
                                                                    }))
                                                                }
                                                            />
                                                            <Button
                                                                variant="outlined"
                                                                size="small"
                                                                disabled={modoModificacionPlazo}
                                                                onClick={() =>
                                                                    !modoModificacionPlazo &&
                                                                    setEditESituacional(prev => ({
                                                                        ...prev,
                                                                        numero: prev.sinNumero ? '' : 'S/N',
                                                                        sinNumero: !prev.sinNumero,
                                                                    }))
                                                                }
                                                            >
                                                                {editESituacional.sinNumero ? 'Con número' : '¿Sin número?'}
                                                            </Button>
                                                            <FormControlLabel
                                                                control={
                                                                    <Checkbox
                                                                        checked={editESituacional.superior || false}
                                                                        onChange={e =>
                                                                            setEditESituacional(prev => ({
                                                                                ...prev,
                                                                                superior: e.target.checked,
                                                                            }))
                                                                        }
                                                                        disabled={modoModificacionPlazo}
                                                                    />
                                                                }
                                                                label="SUPERIOR"
                                                                sx={{ marginLeft: 1 }}
                                                            />
                                                        </Box>
                                                    ) : editESituacional.tipoNotificacion === 'PROVIDENCIA' ? (
                                                        <Box display="flex" alignItems="center" gap={1}>
                                                            <TextField
                                                                label="Número"
                                                                type="text"
                                                                fullWidth
                                                                variant="standard"
                                                                margin="normal"
                                                                value={editESituacional.numero}
                                                                disabled={modoModificacionPlazo || editESituacional.sinNumero}
                                                                InputProps={{
                                                                    startAdornment: !editESituacional.sinNumero && (
                                                                        <InputAdornment position="start">N°</InputAdornment>
                                                                    ),
                                                                }}
                                                                onChange={(e) =>
                                                                    !modoModificacionPlazo &&
                                                                    setEditESituacional(prev => ({
                                                                        ...prev,
                                                                        numero: e.target.value,
                                                                        sinNumero: false,
                                                                    }))
                                                                }
                                                            />
                                                            <Button
                                                                variant="outlined"
                                                                size="small"
                                                                disabled={modoModificacionPlazo}
                                                                onClick={() =>
                                                                    !modoModificacionPlazo &&
                                                                    setEditESituacional(prev => ({
                                                                        ...prev,
                                                                        numero: prev.sinNumero ? '' : 'S/N',
                                                                        sinNumero: !prev.sinNumero,
                                                                    }))
                                                                }
                                                            >
                                                                {editESituacional.sinNumero ? 'Con número' : '¿Sin número?'}
                                                            </Button>
                                                        </Box>
                                                    ) : (
                                                        <TextField
                                                            label="Número"
                                                            type="number"
                                                            fullWidth
                                                            variant="standard"
                                                            margin="normal"
                                                            value={editESituacional.numero}
                                                            disabled={modoModificacionPlazo}
                                                            onChange={(e) =>
                                                                !modoModificacionPlazo &&
                                                                setEditESituacional(prev => ({
                                                                    ...prev,
                                                                    numero: e.target.value,
                                                                }))
                                                            }
                                                        />
                                                    )}

                                                    <TextField
                                                        label="Año"
                                                        type="number"
                                                        fullWidth
                                                        variant="standard"
                                                        margin="normal"
                                                        value={editESituacional.anio || ''}
                                                        disabled={modoModificacionPlazo}
                                                        onChange={(e) =>
                                                            !modoModificacionPlazo &&
                                                            setEditESituacional(prev => ({
                                                                ...prev,
                                                                anio: e.target.value,
                                                            }))
                                                        }
                                                    />

                                                    {editESituacional.tipoNotificacion === 'RESOLUCIÓN' && (
                                                        <TextField
                                                            label="Cuaderno"
                                                            type="number"
                                                            fullWidth
                                                            variant="standard"
                                                            margin="normal"
                                                            value={editESituacional.cuaderno}
                                                            disabled={modoModificacionPlazo}
                                                            onChange={(e) =>
                                                                !modoModificacionPlazo &&
                                                                setEditESituacional(prev => ({
                                                                    ...prev,
                                                                    cuaderno: e.target.value,
                                                                }))
                                                            }
                                                        />
                                                    )}
                                                </>

                                )}


                                {/* El campo "Información Específica" se inicializa con el valor original extraído */}
                                <EditModal
                                    openEditModal={openEditModal}
                                    editESituacional={editESituacional}
                                    setEditESituacional={setEditESituacional}
                                    disabled={modoModificacionPlazo}
                                />


                                {/* Vista previa dinámica de e_situacional */}
                                <Box mt={2} p={2} sx={{ border: '1px dashed #aaa' }}>
                                    <Typography variant="subtitle1" gutterBottom>
                                        Vista previa e_situacional
                                    </Typography>

                                    <Typography variant="body2">
                                  {(() => {
                                      const {
                                          tipoNotificacion,
                                          numero,
                                          anio,
                                          cuaderno,
                                          informacionEspecifica,
                                          tipoActa,
                                          tieneCuaderno,
                                          lugar,
                                          superior = false,
                                      } = editESituacional;
                                      // Declaración de numeroDisplay para todas las ramas
                                      const numeroDisplay =
                                          numero && numero !== 'S/N'
                                              ? `N° ${numero}`
                                              : numero || '';
                                      let preview = '';

                                             if (tipoNotificacion === 'DISPOSICIÓN' || tipoNotificacion === 'PROVIDENCIA') {
                                                // si es DISPOSICIÓN y superior=true, usamos "DISPOSICIÓN SUPERIOR"
                                                const prefix =
                                                    tipoNotificacion === 'DISPOSICIÓN' && superior
                                                        ? 'DISPOSICIÓN SUPERIOR'
                                                        : tipoNotificacion;
                                                const numeroDisplay =
                                                    numero && numero !== 'S/N' ? `N° ${numero}` : numero || '';
                                                preview = `${prefix} ${numeroDisplay}-${anio || ''}` +
                                                    `${informacionEspecifica ? ' : ' + informacionEspecifica : ''}`;
                                            } else if (tipoNotificacion === 'RESOLUCIÓN') {
                                                const numeroDisplay =
                                                    numero && numero !== 'S/N' ? `N° ${numero}` : numero || '';
                                                preview = `${tipoNotificacion} ${numeroDisplay}-${anio || ''}` +
                                                    `${cuaderno ? ' DEL CUADERNO ' + cuaderno : ''}` +
                                                    `${informacionEspecifica ? ' : ' + informacionEspecifica : ''}`;
                                            } else if (tipoNotificacion === 'ACTA') {
                                                const actaPart = tipoActa ? ` (${tipoActa})` : '';
                                                const cuadernoPart =
                                                    tieneCuaderno === 'SI' && cuaderno
                                                        ? ` DEL CUADERNO ${cuaderno}`
                                                        : '';
                                                preview = `${tipoNotificacion}${actaPart}${cuadernoPart}` +
                                                    `${informacionEspecifica ? ' : ' + informacionEspecifica : ''}`;
                                            } else if (tipoNotificacion === 'OFICIO' || tipoNotificacion === 'CITACIÓN POLICIAL') {
                                                preview = `${tipoNotificacion} ${numeroDisplay}-${anio}` +
                                                    `${lugar ? ' LUGAR ' + lugar : ''}` +
                                                    `${informacionEspecifica ? ' : ' + informacionEspecifica : ''}`;
                                            } else if (tipoNotificacion === 'OTROS') {
                                                preview = `${tipoNotificacion} ${numero || ''}` +
                                                    `${informacionEspecifica ? ' : ' + informacionEspecifica : ''}`;
                                            } else {
                                                const numeroDisplay =
                                                    numero && numero !== 'S/N' ? `N° ${numero}` : numero || '';
                                                preview = `${tipoNotificacion}` +
                                                    `${numeroDisplay ? ' ' + numeroDisplay : ''}` +
                                                    `${informacionEspecifica ? ' : ' + informacionEspecifica : ''}`;
                                            }

                                            return preview;
                                        })()}
                                    </Typography>
                                </Box>



                                {/* Botón para alternar el modo audiencia */}
                                <Button
                                    variant="outlined"
                                    color="primary"
                                    onClick={() => toggleAudienciaBoth(editRowIndex)}
                                    sx={{ mt: 1, mb: 2 }}
                                >
                                    {editFormValues.audiencia ? 'Desactivar Audiencia' : 'Activar Audiencia'}
                                </Button>
                                {editFormValues.audiencia && (
                                    <Box display="flex" gap={1} mb={2}>
                                        <Button
                                            variant={editFormValues.reprogramacion === 'SI' ? 'contained' : 'outlined'}
                                            onClick={() =>
                                                setEditFormValues((prev) => ({ ...prev, reprogramacion: 'SI' }))
                                            }
                                            size="small"
                                        >
                                            Sí
                                        </Button>
                                        <Button
                                            variant={editFormValues.reprogramacion === 'NO' ? 'contained' : 'outlined'}
                                            onClick={() =>
                                                setEditFormValues((prev) => ({ ...prev, reprogramacion: 'NO' }))
                                            }
                                            size="small"
                                        >
                                            No
                                        </Button>
                                    </Box>
                                )}

                                {editFormValues.plazoTipo === 'AMBOS' ? (
                                    <>
                                        {/* Bloque Audiencia */}
                                        <Box mt={2}>
                                            <Typography variant="h6">Audiencia</Typography>
                                            <TextField
                                                label="Acción - Audiencia"
                                                variant="standard"
                                                fullWidth
                                                margin="normal"
                                                value={editFormValues.accionAudiencia}
                                                onChange={(e) =>
                                                    setEditFormValues((prev) => ({ ...prev, accionAudiencia: e.target.value }))
                                                }
                                            />
                                            <TextField
                                                label="Fecha (dd-mm-yyyy) – Audiencia"
                                                variant="standard"
                                                fullWidth
                                                margin="normal"
                                                value={editFormValues.plazo_fecha}
                                                onChange={(e) => {
                                                    const formatted = autoFormatFecha(e.target.value);
                                                    setEditFormValues((prev) => ({ ...prev, plazo_fecha: formatted }));
                                                    if (formatted && !validateFecha(formatted)) {
                                                        setPlazoError('Fecha inválida');
                                                    } else {
                                                        setPlazoError('');
                                                    }
                                                }}
                                                error={Boolean(plazoError)}
                                                helperText={plazoError}
                                            />
                                            <TextField
                                                label="Hora (HH:MM) – Audiencia"
                                                variant="standard"
                                                fullWidth
                                                margin="normal"
                                                value={editFormValues.plazo_hora}
                                                onChange={(e) => {
                                                    const formatted = autoFormatHora(e.target.value);
                                                    setEditFormValues((prev) => ({ ...prev, plazo_hora: formatted }));
                                                    if (formatted && !validateHora(formatted)) {
                                                        setPlazoError('Hora inválida');
                                                    } else {
                                                        setPlazoError('');
                                                    }
                                                }}
                                                error={Boolean(plazoError)}
                                                helperText={plazoError}
                                            />
                                            <Box mt={2}>
                                                <FormControl component="fieldset">
                                                    <FormLabel component="legend">AM/PM – Audiencia</FormLabel>
                                                    <RadioGroup
                                                        row
                                                        value={editFormValues.AmPm}
                                                        onChange={(e) =>
                                                            setEditFormValues((prev) => ({ ...prev, AmPm: e.target.value }))
                                                        }
                                                    >
                                                        <FormControlLabel value="AM" control={<Radio />} label="AM" />
                                                        <FormControlLabel value="PM" control={<Radio />} label="PM" />
                                                    </RadioGroup>
                                                </FormControl>
                                            </Box>
                                            <Box display="flex" gap={1} mb={2}>
                                                <Button
                                                    variant={editFormValues.reprogramacion === 'SI' ? 'contained' : 'outlined'}
                                                    onClick={() =>
                                                        setEditFormValues((prev) => ({ ...prev, reprogramacion: 'SI' }))
                                                    }
                                                    size="small"
                                                >
                                                    Sí, REPROGRAMACION?
                                                </Button>
                                                <Button
                                                    variant={editFormValues.reprogramacion === 'NO' ? 'contained' : 'outlined'}
                                                    onClick={() =>
                                                        setEditFormValues((prev) => ({ ...prev, reprogramacion: 'NO' }))
                                                    }
                                                    size="small"
                                                >
                                                    No, REPROGRAMACION?
                                                </Button>
                                            </Box>
                                        </Box>
                                        {/* Bloque Requerimiento */}
                                        <Box mt={2}>
                                            <Typography variant="h6">Requerimiento</Typography>
                                            <TextField
                                                label="Acción - Requerimiento"
                                                variant="standard"
                                                fullWidth
                                                margin="normal"
                                                value={editFormValues.accionRequerimiento}
                                                onChange={(e) =>
                                                    setEditFormValues((prev) => ({ ...prev, accionRequerimiento: e.target.value }))
                                                }
                                            />
                                            <TextField
                                                label="Plazo – Requerimiento"
                                                variant="standard"
                                                fullWidth
                                                margin="normal"
                                                value={editFormValues.plazo_atencion}
                                                onChange={(e) => {
                                                    const numericValue = e.target.value.replace(/\D/g, '');
                                                    setEditFormValues((prev) => ({ ...prev, plazo_atencion: numericValue }));
                                                }}
                                                inputProps={{
                                                    inputMode: 'numeric',
                                                    pattern: '[0-9]*'
                                                }}
                                            />
                                        </Box>
                                    </>
                                ) : (
                                    <>
                                        <TextField
                                            label="Acción"
                                            variant="standard"
                                            fullWidth
                                            margin="normal"
                                            value={editFormValues.accion}
                                            onChange={(e) =>
                                                setEditFormValues((prev) => ({ ...prev, accion: e.target.value }))
                                            }
                                        />
                                        {editFormValues.plazoTipo === 'AUDIENCIA' && (
                                            <div className="mb-3">
                                                <TextField
                                                    label="Fecha (dd-mm-yyyy) – Audiencia"
                                                    variant="standard"
                                                    fullWidth
                                                    margin="normal"
                                                    value={editFormValues.plazo_fecha}
                                                    onChange={(e) => {
                                                        const formatted = autoFormatFecha(e.target.value);
                                                        setEditFormValues((prev) => ({ ...prev, plazo_fecha: formatted }));
                                                        if (formatted && !validateFecha(formatted)) {
                                                            setPlazoError('Fecha inválida');
                                                        } else {
                                                            setPlazoError('');
                                                        }
                                                    }}
                                                    error={Boolean(plazoError)}
                                                    helperText={plazoError}
                                                />
                                                <TextField
                                                    label="Hora (HH:MM) – Audiencia"
                                                    variant="standard"
                                                    fullWidth
                                                    margin="normal"
                                                    value={editFormValues.plazo_hora}
                                                    onChange={(e) => {
                                                        const formatted = autoFormatHora(e.target.value);
                                                        setEditFormValues((prev) => ({ ...prev, plazo_hora: formatted }));
                                                        if (formatted && !validateHora(formatted)) {
                                                            setPlazoError('Hora inválida');
                                                        } else {
                                                            setPlazoError('');
                                                        }
                                                    }}
                                                    error={Boolean(plazoError)}
                                                    helperText={plazoError}
                                                />
                                                <Box mt={2}>
                                                    <FormControl component="fieldset">
                                                        <FormLabel component="legend">AM/PM – Audiencia</FormLabel>
                                                        <RadioGroup
                                                            row
                                                            value={editFormValues.AmPm}
                                                            onChange={(e) =>
                                                                setEditFormValues((prev) => ({ ...prev, AmPm: e.target.value }))
                                                            }
                                                        >
                                                            <FormControlLabel value="AM" control={<Radio />} label="AM" />
                                                            <FormControlLabel value="PM" control={<Radio />} label="PM" />
                                                        </RadioGroup>
                                                    </FormControl>
                                                </Box>
                                                <Box display="flex" gap={1} mb={2}>
                                                    <Button
                                                        variant={editFormValues.reprogramacion === 'SI' ? 'contained' : 'outlined'}
                                                        onClick={() =>
                                                            setEditFormValues((prev) => ({ ...prev, reprogramacion: 'SI' }))
                                                        }
                                                        size="small"
                                                    >
                                                        Sí, REPROGRAMACION?
                                                    </Button>
                                                    <Button
                                                        variant={editFormValues.reprogramacion === 'NO' ? 'contained' : 'outlined'}
                                                        onClick={() =>
                                                            setEditFormValues((prev) => ({ ...prev, reprogramacion: 'NO' }))
                                                        }
                                                        size="small"
                                                    >
                                                        No, REPROGRAMACION?
                                                    </Button>
                                                </Box>
                                            </div>
                                        )}
                                        {editFormValues.plazoTipo === 'REQUERIMIENTO' && (
                                            <div className="mb-3">
                                                <TextField
                                                    label="Plazo – Requerimiento"
                                                    variant="standard"
                                                    fullWidth
                                                    margin="normal"
                                                    value={editFormValues.plazo_atencion}
                                                    onChange={(e) => {
                                                        const numericValue = e.target.value.replace(/\D/g, '');
                                                        setEditFormValues((prev) => ({ ...prev, plazo_atencion: numericValue }));
                                                    }}
                                                    inputProps={{
                                                        inputMode: 'numeric',
                                                        pattern: '[0-9]*'
                                                    }}
                                                />
                                            </div>
                                        )}
                                    </>
                                )}

                                {/* Radio group para seleccionar el Tipo de Plazo */}
                                <FormControl component="fieldset" sx={{ mt: 2 }}>
                                    <FormLabel component="legend">Tipo de Plazo</FormLabel>
                                    <RadioGroup
                                        row
                                        value={editFormValues.plazoTipo || 'REQUERIMIENTO'}
                                        onChange={(e) =>
                                            setEditFormValues((prev) => ({ ...prev, plazoTipo: e.target.value }))
                                        }
                                    >
                                        <FormControlLabel value="AUDIENCIA" control={<Radio />} label="Audiencia" />
                                        <FormControlLabel value="REQUERIMIENTO" control={<Radio />} label="Requerimiento" />
                                        <FormControlLabel value="AMBOS" control={<Radio />} label="Ambos" />
                                    </RadioGroup>
                                </FormControl>

                                {/* Campos comunes */}
                                <TextField
                                    label="FECHA DE LA NOTIFICACIÓN (dd-mm-aaaa)"
                                    variant="standard"
                                    fullWidth
                                    margin="normal"
                                    value={editFormValues.fecha_atencion}
                                    onChange={handleNotificacionFechaChange}
                                    error={Boolean(fechaError)}
                                    helperText={fechaError}
                                />

                                <TextField
                                    label="denunciado"
                                    variant="standard"
                                    fullWidth
                                    margin="normal"
                                    value={editFormValues.denunciado}
                                    onChange={(e) =>
                                        setEditFormValues((prev) => ({ ...prev, denunciado: e.target.value }))
                                    }
                                />
                                <Box mt={2} display="flex" justifyContent="space-between">
                                    <Button variant="contained" color="primary" onClick={handleFinalizeEdit}>
                                        Finalizar
                                    </Button>
                                    <Button variant="outlined" color="secondary" onClick={closeEditModal}>
                                        Cancelar
                                    </Button>
                                </Box>

                            </Box>
                            {/* Columna derecha: Sugerencias de Situación */}
                            <Box flex={1} p={2} overflow="auto">
                                <Typography variant="h6" gutterBottom>
                                    Sugerencias de Situación
                                </Typography>
                                {datosMinimal[editRowIndex]?.registro_ppu &&
                                    historialCache[datosMinimal[editRowIndex].registro_ppu] ? (() => {
                                        const raw = historialCache[datosMinimal[editRowIndex].registro_ppu];
                                        const prefix = buildImmutablePrefix(editESituacional);

                                        // Ordenamos TODO el historial, colocando primero las coincidencias
                                        const sorted = sortHistory(raw, prefix);

                                        return (
                                            <TableContainer component={Paper}>
                                                <Table size="small">
                                                    <TableHead>
                                                        <TableRow>
                                                            <TableCell>Versión</TableCell>
                                                            <TableCell>Abogado</TableCell>
                                                            <TableCell>Caso fiscal corto</TableCell>
                                                            <TableCell>Situación</TableCell>
                                                            <TableCell>PDF</TableCell>
                                                        </TableRow>
                                                    </TableHead>
                                                    <TableBody>
                                                        {sorted.map((entry, i) => {
                                                            // Construimos un regex que ignore ceros a la izquierda tras "N°"
                                                            const escaped = prefix.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                                                            const zeroTolerant = escaped.replace(/N°\s*0*(\d+)/i, 'N°\\s*0*$1');
                                                            const re = new RegExp(`(${zeroTolerant})`, 'i');

                                                            return (
                                                                <TableRow key={i}>
                                                                    <TableCell>{entry.version_id}</TableCell>
                                                                    <TableCell>{entry.abogado}</TableCell>
                                                                    <TableCell>{entry.origen}</TableCell>
                                                                    <TableCell>
                                                                        {entry.e_situacional.split(re).map((part, idx) =>
                                                                            re.test(part)
                                                                                ? <span key={idx} style={{ color: '#d32f2f' }}>{part}</span>
                                                                                : <span key={idx}>{part}</span>
                                                                        )}
                                                                    </TableCell>
                                                                    <TableCell>
                                                                        <Button
                                                                            variant="outlined"
                                                                            size="small"
                                                                            onClick={() => {
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
                                                            );
                                                        })}
                                                    </TableBody>
                                                </Table>
                                            </TableContainer>
                                        );
                                    })() : (
                                    <Typography>No se encontró historial.</Typography>
                                )}
                            </Box>


                        </Box>
                    </Box>
                </Modal>
            )}


        </>
    );
}

function FiscaliaAutocomplete() {
    return <TextField variant="standard" />;
}

export default TablaMinima;
