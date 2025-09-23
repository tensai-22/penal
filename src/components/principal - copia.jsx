import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import BulkUpdateButton from './BOX-PLAZOS/BulkUpdateButton';

import { useDropzone } from 'react-dropzone';
import debounce from 'lodash.debounce';
import { parse, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Popper } from '@mui/material';

import {
    Box, Button, Typography, Modal, TextField, Grid, Paper,
    FormControl, InputLabel, Select, MenuItem, FormControlLabel,
    Checkbox, Pagination, TableContainer, Table, TableHead,
    TableRow, TableCell, TableBody, Autocomplete
} from '@mui/material';
import { FixedSizeList } from 'react-window';
import axios, { CancelToken } from 'axios';

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



const Principal = () => {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    // Estado para seleccionar la pestaña; se asume 0 para mostrar el contenido
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
    const [datos, setDatos] = useState([]);
    const [page, setPage] = useState(1);
    const [totalRecords, setTotalRecords] = useState(0);
    const [totalPages, setTotalPages] = useState(1);

    const API_BASE_URL = 'http://10.50.5.49:5001'; // Ajustar si es necesario
    // Estado para el modal de "Nuevo Caso"
    // Declaración de estados en el modal de “Nuevo Caso”
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
        e_situacional: '',
        tipo_ingreso: ''
    });
    const [filePDF, setFilePDF] = useState(null);
    const [uploadDone, setUploadDone] = useState(false);
    const [suggestedJuzgado, setSuggestedJuzgado] = useState('');
    // DESPUÉS:
    const [showBulkStep, setShowBulkStep] = useState(false);   // controla la 2.ª fase del modal

    const handleAgregarCaso = async () => {
        await agregarCaso();          // reutiliza la lógica ya implementada
    };
    // Manejador de la carga de PDF y sugerencia de “Juzgado”
    const handlePDFChange = async (e) => {
        const file = e.target.files[0];
        if (!file) {
            setUploadDone(false);
            return;
        }
        setFilePDF(file);
        const form = new FormData();
        form.append('file', file);

        try {
            const { data } = await axios.post(
                `${API_BASE_URL}/api/upload_and_suggest`,
                form,
                { withCredentials: true }
            );
            const sugerido = data.suggested_juzgado || '';
            setSuggestedJuzgado(sugerido);
            setNuevoCaso(prev => ({ ...prev, juzgado: sugerido }));
            setUploadDone(true);
        } catch {
            alert('Error al subir o procesar el PDF');
            setUploadDone(false);
        }
    };

    // Validación del formulario ahora exige haber subido el PDF
    const isFormValid = () => {
        // Desestructuramos con fallback a cadena vacía
        const {
            abogado = '',
            denunciado = '',
            delito = '',
            departamento = '',
            tipo_ingreso = ''
        } = nuevoCaso;

        return (
            abogado.trim() !== '' &&
            denunciado.trim() !== '' &&
            delito.trim() !== '' &&
            departamento.trim() !== '' &&
            tipo_ingreso.trim() !== '' &&
            uploadDone
        );
    };



    // Variables y funciones para elementos adicionales
    const role = "admin";
    const username = "defaultUser";
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

    const resetForm = () => {
        setNuevoCaso({
            abogado: "", registro_ppu: "", denunciado: "", origen: "",
            "nr de exp completo": "", delito: "", departamento: "",
            fiscalia: "", juzgado: "", informe_juridico: "",
            e_situacional: "", tipo_ingreso: ""
        });
        setRegistroGenerado("");
        setUploadDone(false);
        setFilePDF(null);
        setMostrarExpedienteJuzgado(false);
        setExpedienteJuzgado({
            campo1: "", campo2: "", campo3: "",
            campo4: "", campo5: "", campo6: "", campo7: ""
        });
        setErroresExpediente({});
        setDespachoNumber("");
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
    const [openImpulsoModal, setOpenImpulsoModal] = useState(false);
    const [busquedaQuery, setBusquedaQuery] = useState('');
    const [busquedaTipo, setBusquedaTipo] = useState('casoJudicial');
    const [impulsoResults, setImpulsoResults] = useState([]);
    const [impulsoTempSeleccionado, setImpulsoTempSeleccionado] = useState(null);
    const [openImpulsoConfirmModal, setOpenImpulsoConfirmModal] = useState(false);
    const [openImpulsoUploadModal, setOpenImpulsoUploadModal] = useState(false);
    const [uploadedFiles, setUploadedFiles] = useState([]);
    const [accionDetail, setAccionDetail] = useState('');


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

    const onDrop = useCallback(
        files => {
            const pdfs = files.filter(f => f.type === 'application/pdf');
            if (uploadedFiles.length + pdfs.length > 4) {
                pdfs.splice(4 - uploadedFiles.length);
            }
            setUploadedFiles(prev => [...prev, ...pdfs]);
        },
        [uploadedFiles]
    );

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'application/pdf': ['.pdf'] },
        multiple: true
    });

    const handleRemoveFile = i => {
        setUploadedFiles(prev => prev.filter((_, idx) => idx !== i));
    };

    const handleUploadPDFs = async () => {
        if (!accionDetail || !impulsoTempSeleccionado || uploadedFiles.length === 0) {
            alert("Es obligatorio ingresar la acción, seleccionar una fila de impulso y cargar al menos un PDF.");
            return;
        }
        const form = new FormData();
        uploadedFiles.forEach(f => form.append('pdfs', f));
        form.append('accion', accionDetail);
        Object.entries(impulsoTempSeleccionado).forEach(([k, v]) => {
            form.append(k.replace(/\s+/g, '_'), v || '');
        });
        try {
            await axios.post(`${API_BASE_URL}/api/impulso/upload`, form, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            alert("Operación completada");
            setUploadedFiles([]);
            setAccionDetail('');
            setOpenImpulsoUploadModal(false);
        } catch {
            alert("Error en la operación");
        }
    };


    // Función para ejecutar búsqueda condicional
    const pdfWindowRef = useRef(null);
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


    // Función auxiliar para generar 'nr de exp completo'
    const buildNrCompleto = (fiscaliaCode, casoCorto) => {
        const partes = casoCorto.split('-').map(p => p.trim());
        if (partes.length !== 2) return '';
        const [num, year] = partes;
        return `${fiscaliaCode}-${year}-${num}-0`;
    };





    useEffect(() => {
        debouncedBuscarDatos(1, query);
        return () => debouncedBuscarDatos.cancel();
    }, [query, debouncedBuscarDatos]);

    // Manejo del cambio en el campo de búsqueda
    const handleQueryChange = (e) => {
        const newQuery = e.target.value;
        setQuery(newQuery);
        setPage(1); // Reinicia la página a 1
        debouncedBuscarDatos(1, newQuery);
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

    // Funciones para el modal de "Nuevo Caso"
    // ─── FASE-1: Alta del caso ──────────────────────────────────────────────
    const agregarCaso = async () => {
        try {
            /* 1.  Validaciones & normalizaciones ─────────────────────────────── */
            let origenValue = nuevoCaso.origen || "";

            if (mostrarExpedienteJuzgado) {
                const hayErrores = Object.values(erroresExpediente).some((e) => e);
                if (hayErrores) {
                    alert("Corrija los errores en el expediente.");
                    return;
                }
                const vacíos = Object.values(expedienteJuzgado).some((v) => !v.trim());
                if (vacíos) {
                    alert("Complete todos los campos del expediente.");
                    return;
                }
            }

            if (/^\d/.test(origenValue)) origenValue = `CASO ${origenValue}`;

            /* 2.  Construimos el payload para /api/agregar ───────────────────── */
            const { item, ...dataToSend } = nuevoCaso;         // quitamos 'item'
            dataToSend.origen = origenValue;
            dataToSend.tipo_ingreso = nuevoCaso.tipo_ingreso;
            delete dataToSend.e_situacional;                   // lo pone el back-end

            if (dataToSend.fiscalia && despachoNumber) {
                dataToSend.fiscalia = `${dataToSend.fiscalia} - ${despachoNumber} DESPACHO`;
            }
            if (tipoRegistro === "LEGAJO") delete dataToSend.informe_juridico;
            if (tipoRegistro === "DENUNCIA") delete dataToSend.origen;
            if (mostrarExpedienteJuzgado) dataToSend.expediente_juzgado = expedienteJuzgado;

            /* 3.  Alta en el servidor ────────────────────────────────────────── */
            const { data } = await axios.post(`${API_BASE_URL}/api/agregar`, dataToSend);

            // 4.  Guardamos el PPU definitivo y pasamos a la Fase-2
            setRegistroGenerado(data.registro_ppu);   // <-- NECESARIO para BulkUpdate
            setShowBulkStep(true);                    // muestra el BulkUpdateButton

            // (NO limpiamos nada más; se limpiará al cerrar/guardar la Fase-2)
            buscarDatos(1, query);                    // refresca la tabla principal
            alert("Caso agregado. Ahora ingresa los plazos.");
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
    const [tipoRegistro, setTipoRegistro] = useState("LEGAJO");
    const [mostrarExpedienteJuzgado, setMostrarExpedienteJuzgado] = useState(false);
    const [expedienteJuzgado, setExpedienteJuzgado] = useState({
        campo1: "",
        campo2: "",
        campo3: "",
        campo4: "",
        campo5: "",
        campo6: "",
        campo7: ""
    });
    const [erroresExpediente, setErroresExpediente] = useState({});




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

    const [registrosExistentes, setRegistrosExistentes] = useState([]);
    const [registroGenerado, setRegistroGenerado] = useState("");
    const [anioRegistro, setAnioRegistro] = useState("");
    const [casoEspecial, setCasoEspecial] = useState(false);
    const [numeroManual, setNumeroManual] = useState("");
    const [sufijo, setSufijo] = useState("");

    const [fiscaliaOptionsNuevoCaso, setFiscaliaOptionsNuevoCaso] = useState([]);

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
        e.preventDefault();
        const pastedData = e.clipboardData.getData('Text').trim();

        const regex = /(\d{5})-(\d{4})-(\d{1,2})-(\d{4}[A-Z\d]*)-([A-Z]{2})-([A-Z]{2})-(\d{1,2})/;
        const match = pastedData.match(regex);

        if (match) {
            const [, campo1, campo2, campo3, campo4, campo5, campo6, campo7] = match;
            const newExpediente = {
                campo1,
                campo2,
                campo3,
                campo4,
                campo5,
                campo6,
                campo7,
            };

            Object.entries(newExpediente).forEach(([key, value]) => {
                validateExpediente(key, value);
            });

            setExpedienteJuzgado(newExpediente);
        } else {
            alert('Formato de expediente inválido. Revise el texto copiado.');
        }
    };



    const [despachoNumber, setDespachoNumber] = useState("");


    // 1) en tus hooks:
    const [fiscaliaCode, setFiscaliaCode] = useState('');

    // 2) Handler para selección de fiscalía
    const handleFiscaliaChange = (event, newValue) => {
        if (newValue) {
            const code = newValue.nr_de_exp_completo; // ej. "3006014505"
            setFiscaliaCode(code);

            const origen = nuevoCaso.origen || '';
            const m = origen.match(/^(\d+)-(\d{4})$/);
            // si coincide “123-2025” => m[1]==="123", m[2]==="2025"
            const full = m
                ? `${code}-${m[2]}-${m[1]}-0`
                : `${code}-`;

            setNuevoCaso(prev => ({
                ...prev,
                fiscalia: newValue.fiscalia,
                departamento: newValue.departamento,
                origen: origen,
                'nr de exp completo': full,
            }));
        } else {
            // limpieza completa al deseleccionar
            setFiscaliaCode('');
            setNuevoCaso(prev => ({
                ...prev,
                fiscalia: '',
                departamento: '',
                'nr de exp completo': '',
            }));
        }
    };

    // 3) Handler para cambio en “Caso fiscal corto”
    const handleCasoCortoChange = e => {
        const value = e.target.value;
        if (/[^0-9-]/.test(value)) {
            alert('Sólo se permiten dígitos y guiones');
            return;
        }

        setNuevoCaso(prev => {
            const m = value.match(/^(\d+)-(\d{4})$/);
            const full = (fiscaliaCode && m)
                ? `${fiscaliaCode}-${m[2]}-${m[1]}-0`
                : '';
            return {
                ...prev,
                origen: value,
                'nr de exp completo': full,
            };
        });
    };

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

    const handleFiscaliaInputChange = (event, newInputValue) => {
        setNuevoCaso(prevCaso => ({ ...prevCaso, fiscalia: newInputValue }));
        fetchFiscaliasNuevoCaso(newInputValue);
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
    return (
        <>
            {tab === 0 && (
                <>
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

                                {/* Botón para abrir modal de Impulso */}
                                <Box mb={2} display="flex" justifyContent="flex-end">
                                        <Button
                                            variant="contained"
                                            color="primary"
                                            onClick={() => setOpenImpulsoModal(true)}
                                        >
                                            Búsqueda Avanzada
                                        </Button>

                                </Box>
                            </Box>
                            <Box mb={2}>
                                <Typography variant="h6" component="div">
                                    Total de Procesos: {totalRecords}
                                </Typography>
                            </Box>
                                {/* ─────────────────────────────  NUEVO MODAL  ───────────────────────────── */}
                                <Modal
                                    open={openModal}
                                    onClose={() => {
                                        setShowBulkStep(false);   // si se cierra, volvemos siempre a la Fase 1
                                        setOpenModal(false);
                                    }}
                                >
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
                                        {/* ═══════════════════════════  FASE 1 – FORMULARIO  ═══════════════════════════ */}
                                        {!showBulkStep && (
                                            <>
                                                <Typography variant="h6">Crear Registro PPU</Typography>

                                                {/* tipo registro, año, caso especial … */}
                                                <FormControl fullWidth>
                                                    <InputLabel>Tipo de Registro</InputLabel>
                                                    <Select
                                                        value={tipoRegistro}
                                                        label="Tipo de Registro"
                                                        onChange={(e) => {
                                                            setTipoRegistro(e.target.value);
                                                            setMostrarExpedienteJuzgado(false);
                                                            setExpedienteJuzgado({
                                                                campo1: "", campo2: "", campo3: "",
                                                                campo4: "", campo5: "", campo6: "", campo7: ""
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
                                                <ul style={{ maxHeight: 200, overflowY: "auto" }}>
                                                    {registrosExistentes.map((reg) => (
                                                        <li key={reg}>{reg}</li>
                                                    ))}
                                                </ul>

                                                {registroGenerado && (
                                                    <>
                                                        <Typography variant="h6">
                                                            Registro PPU Generado: {registroGenerado}
                                                        </Typography>

                                                        {/* ─────── CAMPOS PRINCIPALES ─────── */}
                                                        <TextField
                                                            required
                                                            label="ABOGADO"
                                                            variant="outlined"
                                                            value={nuevoCaso.abogado}
                                                            onChange={(e) =>
                                                                setNuevoCaso((p) => ({ ...p, abogado: e.target.value }))
                                                            }
                                                            fullWidth
                                                        />

                                                        <TextField
                                                            label="REGISTRO PPU"
                                                            variant="outlined"
                                                            value={nuevoCaso.registro_ppu}
                                                            disabled
                                                            fullWidth
                                                        />

                                                        <TextField
                                                            required
                                                            label="DENUNCIADO"
                                                            variant="outlined"
                                                            value={nuevoCaso.denunciado}
                                                            onChange={(e) =>
                                                                setNuevoCaso((p) => ({ ...p, denunciado: e.target.value }))
                                                            }
                                                            fullWidth
                                                        />

                                                        {/* —— campos específicos si es LEGAJO —— */}
                                                        {tipoRegistro === "LEGAJO" && (
                                                            <>
                                                                <TextField
                                                                    label="CASO FISCAL CORTO"
                                                                    variant="outlined"
                                                                    value={nuevoCaso.origen}
                                                                    onChange={handleCasoCortoChange}
                                                                    fullWidth
                                                                />

                                                                <Autocomplete
                                                                    options={fiscaliaOptionsNuevoCaso}
                                                                    getOptionLabel={o => o.fiscalia}
                                                                    // ← compara por nr_de_exp_completo en lugar de igualdad de objeto
                                                                    isOptionEqualToValue={(option, value) =>
                                                                        option.nr_de_exp_completo === value?.nr_de_exp_completo
                                                                    }
                                                                    onInputChange={handleFiscaliaInputChange}
                                                                    onChange={handleFiscaliaChange}
                                                                    inputValue={nuevoCaso.fiscalia}
                                                                    renderInput={params => (
                                                                        <TextField {...params} label="FISCALÍA" fullWidth />
                                                                    )}
                                                                />


                                                                <TextField
                                                                    label="CASO FISCAL COMPLETO"
                                                                    variant="outlined"
                                                                    value={nuevoCaso["nr de exp completo"]}
                                                                    InputProps={{ readOnly: true }}
                                                                    fullWidth
                                                                />

                                                                <FormControlLabel
                                                                    control={
                                                                        <Checkbox
                                                                            checked={mostrarExpedienteJuzgado}
                                                                            onChange={(e) =>
                                                                                setMostrarExpedienteJuzgado(e.target.checked)
                                                                            }
                                                                        />
                                                                    }
                                                                    label="Marcar si hay expediente en juzgado"
                                                                />

                                                                {mostrarExpedienteJuzgado && (
                                                                    <Box sx={{ mt: 2 }}>
                                                                        <Typography variant="subtitle1">
                                                                            Expediente en Juzgado
                                                                        </Typography>
                                                                        <Grid container spacing={2} alignItems="center">
                                                                            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                                                                                <Grid
                                                                                    item
                                                                                    xs={12}
                                                                                    sm={6}
                                                                                    md={i <= 4 ? 2 : 1}
                                                                                    key={`campo${i}`}
                                                                                >
                                                                                    <TextField
                                                                                        label={`Campo ${i}`}
                                                                                        variant="outlined"
                                                                                        value={expedienteJuzgado[`campo${i}`]}
                                                                                        onChange={(e) =>
                                                                                            handleExpedienteChange(`campo${i}`, e.target.value)
                                                                                        }
                                                                                        error={!!erroresExpediente[`campo${i}`]}
                                                                                        helperText={erroresExpediente[`campo${i}`]}
                                                                                        onPaste={i === 1 ? handleOrigenPasteExpediente : undefined}
                                                                                        fullWidth
                                                                                    />
                                                                                </Grid>

                                                                            ))}
                                                                        </Grid>
                                                                    </Box>
                                                                )}
                                                            </>
                                                        )}

                                                        {/* —— campos comunes —— */}
                                                        <TextField
                                                            required
                                                            label="DELITO"
                                                            variant="outlined"
                                                            value={nuevoCaso.delito}
                                                            onChange={(e) =>
                                                                setNuevoCaso((p) => ({ ...p, delito: e.target.value }))
                                                            }
                                                            fullWidth
                                                        />

                                                        <TextField
                                                            required
                                                            label="DEPARTAMENTO"
                                                            variant="outlined"
                                                            value={nuevoCaso.departamento}
                                                            onChange={(e) =>
                                                                setNuevoCaso((p) => ({ ...p, departamento: e.target.value }))
                                                            }
                                                            fullWidth
                                                        />

                                                        {/* PDF + juzgado sugerido */}
                                                        <Box sx={{ mb: 2 }}>
                                                            <input
                                                                type="file"
                                                                accept="application/pdf"
                                                                onChange={handlePDFChange}
                                                            />
                                                            {!uploadDone ? (
                                                                <Typography color="error" variant="body2">
                                                                    * Debe subir un PDF para continuar
                                                                </Typography>
                                                            ) : (
                                                                <Typography variant="body2">
                                                                    ✔ PDF subido: {filePDF?.name}
                                                                </Typography>
                                                            )}
                                                        </Box>

                                                        <TextField
                                                            label="JUZGADO"
                                                            variant="outlined"
                                                            value={nuevoCaso.juzgado}
                                                            onChange={(e) =>
                                                                setNuevoCaso((p) => ({ ...p, juzgado: e.target.value }))
                                                            }
                                                            helperText={
                                                                suggestedJuzgado ? `Sugerido: ${suggestedJuzgado}` : ""
                                                            }
                                                            fullWidth
                                                        />

                                                        {nuevoCaso.fiscalia && (
                                                            <TextField
                                                                label="DIGITE NÚMERO DE DESPACHO"
                                                                variant="outlined"
                                                                value={despachoNumber}
                                                                onChange={(e) => setDespachoNumber(e.target.value)}
                                                                fullWidth
                                                            />
                                                        )}

                                                        <FormControl required fullWidth>
                                                            <InputLabel id="tipo-ingreso-label">Tipo de ingreso</InputLabel>
                                                            <Select
                                                                labelId="tipo-ingreso-label"
                                                                value={nuevoCaso.tipo_ingreso}
                                                                label="Tipo de ingreso"
                                                                onChange={(e) =>
                                                                    setNuevoCaso((p) => ({ ...p, tipo_ingreso: e.target.value }))
                                                                }
                                                            >
                                                                <MenuItem value="INGRESO NUEVO">Ingreso nuevo</MenuItem>
                                                                <MenuItem value="CONSULTA">Consulta</MenuItem>
                                                            </Select>
                                                        </FormControl>

                                                        {tipoRegistro === "DENUNCIA" && (
                                                            <TextField
                                                                label="INFORME JURÍDICO"
                                                                variant="outlined"
                                                                value={nuevoCaso.informe_juridico}
                                                                onChange={(e) =>
                                                                    setNuevoCaso((p) => ({
                                                                        ...p,
                                                                        informe_juridico: e.target.value
                                                                    }))
                                                                }
                                                                fullWidth
                                                            />
                                                        )}

                                                        {/* —— BOTONES —— */}
                                                        <Box display="flex" justifyContent="space-between" mt={2}>
                                                            <Button
                                                                variant="contained"
                                                                onClick={agregarCaso}             /* guarda y pasa a fase 2 */
                                                                disabled={!isFormValid()}
                                                                fullWidth
                                                                sx={{ mr: 1 }}
                                                            >
                                                                Agregar Caso
                                                            </Button>
                                                            <Button
                                                                variant="outlined"
                                                                color="secondary"
                                                                onClick={eliminarCaso}
                                                                fullWidth
                                                                sx={{ ml: 1 }}
                                                            >
                                                                Eliminar Caso
                                                            </Button>
                                                        </Box>
                                                    </>
                                                )}
                                            </>
                                        )}

                                        {/* ═══════════════════════════  FASE 2 – PLAZOS BULK  ═══════════════════════════ */}
                                        {showBulkStep && (
                                            <>
                                                <Typography variant="h6" sx={{ mb: 2 }}>
                                                    Cargar plazos para {registroGenerado}
                                                </Typography>
                                                <BulkUpdateButton
                                                    registro={{ ...nuevoCaso, registro_ppu: registroGenerado }}
                                                    pdfFile={filePDF}  
                                                    open
                                                    onClose={() => {
                                                        setShowBulkStep(false);    // volvemos a Fase 1
                                                        setOpenModal(false);       // cerramos modal
                                                        resetForm();               // ← aquí limpias todo
                                                    }}
                                                    onUpdated={() => {
                                                        setShowBulkStep(false);
                                                        setOpenModal(false);
                                                        resetForm();               // ← idem al guardar
                                                        buscarDatos(1, query);
                                                    }}
                                                />

                                            </>
                                        )}
                                    </Box>
                                </Modal>
                                {/* ────────────────────────────  FIN NUEVO MODAL  ──────────────────────────── */}


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
                                                    const fixedHeader = "Registro PPU";
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
                                                        "Acciones"
                                                    ];
                                                    const half = Math.ceil(otherHeaders.length / 2);
                                                    const displayedHeaders =
                                                        headerPage === 1 ? otherHeaders.slice(0, half) : otherHeaders.slice(half);
                                                    return [fixedHeader, ...displayedHeaders].map((header, idx) => (
                                                        <TableCell
                                                            key={idx}
                                                            sx={{
                                                                p: 1,
                                                                fontSize: "0.75rem",
                                                                textAlign: "center",
                                                                wordBreak: "break-word"
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
                                                const isEditing = editingRowId === dato.registro_ppu;
                                                const renderCellContent = (fieldValue, fieldKey) => {
                                                    if (!isEditing) {
                                                        return fieldValue;
                                                    }
                                                    if (fieldKey === "registro_ppu" || fieldKey === "acciones") {
                                                        return fieldValue;
                                                    }
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
                                                            return fieldValue;
                                                        }
                                                    }
                                                    return fieldValue;
                                                };

                                                const fixedCell = (
                                                    <TableCell
                                                        key="registro_ppu"
                                                        sx={{
                                                            p: 1,
                                                            textAlign: "center",
                                                            wordBreak: "break-word"
                                                        }}
                                                    >
                                                        {dato.registro_ppu || ""}
                                                    </TableCell>
                                                );

                                                const columnsData = [
                                                    [dato.e_situacional, "e_situacional"],
                                                    [dato.abogado, "abogado"],
                                                    [dato.denunciado, "denunciado"],
                                                    [dato.origen, "origen"],
                                                    [dato["nr de exp completo"], "nr_de_exp_completo"],
                                                    [dato.delito, "delito"],
                                                    [dato.departamento, "departamento"],
                                                    [dato.fiscalia, "fiscalia"],
                                                    [dato.juzgado, "juzgado"],
                                                    [dato.informe_juridico, "informe_juridico"],
                                                    [dato.fecha_ingreso, "fecha_ingreso"],
                                                    [dato.last_modified, "last_modified"],
                                                    [dato.etiqueta, "etiqueta"],
                                                    [
                                                        <Box key="acciones" display="flex" justifyContent="center" gap={1}>
                                                            <Button
                                                                variant="contained"
                                                                color="primary"
                                                                onClick={() => (isEditing ? handleSaveClick() : handleEditClick(dato))}
                                                                sx={{ minWidth: 80 }}
                                                            >
                                                                {isEditing ? "Guardar" : "Modificar"}
                                                            </Button>
                                                            <Button
                                                                variant="outlined"
                                                                color="secondary"
                                                                onClick={() => {
                                                                    setSelectedRegistroPPU(dato.registro_ppu);
                                                                    setAdvancedModalOpen(true);
                                                                }}
                                                                sx={{ minWidth: 80 }}
                                                            >
                                                                Avanzado
                                                            </Button>
                                                        </Box>,
                                                        "acciones"
                                                    ]
                                                ];
                                                const half = Math.ceil(columnsData.length / 2);
                                                const displayedCols =
                                                    headerPage === 1 ? columnsData.slice(0, half) : columnsData.slice(half);
                                                const renderedCells = displayedCols.map(([value, key], colIndex) => (
                                                    <TableCell
                                                        key={key || colIndex}
                                                        sx={{
                                                            p: 1,
                                                            textAlign: "center",
                                                            wordBreak: "break-word"
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
                                                            fontSize: "0.75rem"
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

                                {/* Modal para búsqueda de impulso */}
                                <Modal open={openImpulsoModal} onClose={() => setOpenImpulsoModal(false)}>
                                    <Box sx={{ ...modalStyle, width: 800 }}>
                                        <Typography variant="h6" sx={{ mb: 2 }}>Buscar Historial</Typography>
                                        <TextField
                                            label="Consulta"
                                            value={busquedaQuery}
                                            onChange={(e) => {
                                                setImpulsoTempSeleccionado(null);
                                                setBusquedaQuery(e.target.value);
                                                debouncedImpulsoSearch(e.target.value);
                                            }}
                                            fullWidth
                                            margin="normal"
                                        />
                                        <FormControl fullWidth margin="normal">
                                            <InputLabel id="busqueda-tipo-label">Tipo de búsqueda</InputLabel>
                                            <Select
                                                labelId="busqueda-tipo-label"
                                                value={busquedaTipo}
                                                label="Tipo de búsqueda"
                                                onChange={(e) => setBusquedaTipo(e.target.value)}
                                            >
                                                <MenuItem value="casoJudicial">Expediente Judicial</MenuItem>
                                                <MenuItem value="legajo">Registro PPU</MenuItem>
                                                <MenuItem value="casoFiscalCompleto">Caso Fiscal</MenuItem>
                                                <MenuItem value="denunciado">Denunciado</MenuItem>
                                            </Select>
                                        </FormControl>
                                    
                                        {impulsoResults.length > 0 && (
                                            <TableContainer component={Paper} sx={{ maxHeight: 400, mt: 2 }}>
                                                <Table stickyHeader size="small">
                                                    <TableHead>
                                                        <TableRow>
                                                            <TableCell>Abogado</TableCell>
                                                            <TableCell>Registro PPU</TableCell>
                                                            <TableCell>Denunciado</TableCell>
                                                            <TableCell>Origen</TableCell>
                                                            <TableCell>Expediente</TableCell>
                                                            <TableCell>Fiscalía</TableCell>
                                                        </TableRow>
                                                    </TableHead>
                                                    <TableBody>
                                                        {impulsoResults.map((row, index) => (
                                                            <TableRow
                                                                key={index}
                                                                hover
                                                                onClick={() => handleImpulsoRowClick(row)}
                                                                sx={{ cursor: 'pointer' }}
                                                            >
                                                                <TableCell>
                                                                    {highlightMatch(row.abogado, busquedaQuery)}
                                                                </TableCell>
                                                                <TableCell>
                                                                    {highlightMatch(row.registro_ppu || row.consulta_ppu, busquedaQuery)}
                                                                </TableCell>
                                                                <TableCell>
                                                                    {highlightMatch(row.denunciado, busquedaQuery)}
                                                                </TableCell>
                                                                <TableCell>
                                                                    {highlightMatch(row.origen, busquedaQuery)}
                                                                </TableCell>
                                                                <TableCell>
                                                                    {highlightMatch(row['nr de exp completo'], busquedaQuery)}
                                                                </TableCell>
                                                                <TableCell>
                                                                    {highlightMatch(row.fiscalia, busquedaQuery)}
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            </TableContainer>
                                        )}

                                    </Box>
                                </Modal>

                                {/* Modal de confirmación de selección de fila */}
                                <Modal open={openImpulsoConfirmModal} onClose={handleCancelImpulso}>
                                    <Box sx={{ ...modalStyle, width: 600 }}>
                                        <Typography variant="h5" sx={{ mb: 2 }}>
                                            ¿Seguro que desea seleccionar esta fila?
                                        </Typography>
                                        <TableContainer>
                                            <Table size="small">
                                                <TableBody>
                                                    {Object.keys(modalFieldLabels).map((key) => {
                                                        if (impulsoTempSeleccionado && impulsoTempSeleccionado.hasOwnProperty(key)) {
                                                            let valor = impulsoTempSeleccionado[key] || "";
                                                            if (["fecha_de_archivo", "fecha_e_situacional", "fecha_ingreso", "last_modified"].includes(key) && valor) {
                                                                valor = formatModalDate(valor);
                                                            }
                                                            return (
                                                                <TableRow key={key}>
                                                                    <TableCell sx={{ fontWeight: "bold", border: '1px solid #ccc' }}>
                                                                        {modalFieldLabels[key]}
                                                                    </TableCell>
                                                                    <TableCell sx={{ border: '1px solid #ccc' }}>{valor}</TableCell>
                                                                </TableRow>
                                                            );
                                                        }
                                                        return null;
                                                    })}
                                                </TableBody>
                                            </Table>
                                        </TableContainer>
                                        <Box display="flex" justifyContent="space-between" mt={2}>
                                            <Button variant="outlined" onClick={handleCancelImpulso}>
                                                Cancelar
                                            </Button>
                                            <Button variant="contained" color="primary" onClick={handleConfirmImpulso}>
                                                Confirmar
                                            </Button>
                                        </Box>
                                    </Box>
                                </Modal>

                                {/* Modal para carga de PDFs */}
                                <Modal open={openImpulsoUploadModal} onClose={() => setOpenImpulsoUploadModal(false)}>
                                    <Box sx={{ ...modalStyle, width: 600 }}>
                                        <Typography variant="h6" sx={{ mb: 2 }}>Detalle de Impulso</Typography>
                                        <Box sx={{ maxHeight: 200, overflowY: 'auto', mb: 2, border: '1px solid #ccc', padding: '8px' }}>
                                            {impulsoTempSeleccionado && Object.entries(impulsoTempSeleccionado).map(([key, value], idx) => (
                                                <Typography key={idx} variant="body1">
                                                    {modalFieldLabels[key] || key}: {(["fecha_de_archivo", "fecha_e_situacional", "fecha_ingreso", "last_modified"].includes(key) && value) ? formatModalDate(value) : value}
                                                </Typography>
                                            ))}
                                        </Box>
                                        <Box
                                            {...getRootProps()}
                                            sx={{
                                                border: '2px dashed #000',
                                                padding: '20px',
                                                textAlign: 'center',
                                                mb: 2,
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <input {...getInputProps()} />
                                            {isDragActive ? (
                                                <Typography>Soltar archivos PDF aquí</Typography>
                                            ) : (
                                                <Typography>Arrastre hasta 4 archivos PDF o haga clic para seleccionarlos</Typography>
                                            )}
                                        </Box>
                                        {uploadedFiles.length > 0 && (
                                            <Box sx={{ mb: 2 }}>
                                                {uploadedFiles.map((file, index) => (
                                                    <Box key={index} display="flex" alignItems="center" justifyContent="space-between">
                                                        <Typography variant="body2">{file.name}</Typography>
                                                        <Button variant="text" color="error" onClick={() => handleRemoveFile(index)}>
                                                            Eliminar
                                                        </Button>
                                                    </Box>
                                                ))}
                                            </Box>
                                        )}
                                        <TextField
                                            label="Acción"
                                            value={accionDetail}
                                            onChange={(e) => setAccionDetail(e.target.value)}
                                            fullWidth
                                            margin="normal"
                                        />
                                        <Button variant="contained" color="primary" onClick={handleUploadPDFs}>
                                            Guardar PDF(s)
                                        </Button>
                                    </Box>
                                </Modal>
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
                                            Historial de Cambios en la Situación – {selectedRegistroPPU}
                                        </Typography>
                                        {historialData.length > 0 ? (
                                            <TableContainer component={Paper} sx={{ mt: 1 }}>
                                                <Table size="small">
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
                                            <Typography>No se encontró historial con PDF para este registro.</Typography>
                                        )}
                                    </Box>
                                </Modal>

                                {/* —————————————— */}
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
        </>
    );
};

export default Principal;
