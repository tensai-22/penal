// src/components/BulkUpdateButton.jsx
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import debounce from 'lodash.debounce';
import {
    Button,
    Modal,
    Box,
    Typography,
    TextField,
    FormControl,
    FormLabel,
    RadioGroup,
    FormControlLabel,
    Radio,
    Checkbox,
    InputAdornment
} from '@mui/material';

/* ═════════════ utilidades ═════════════ */

const buildImmutablePrefix = ({
    tipoNotificacion,
    numero,
    anio,
    cuaderno,
    lugar,
    tipoActa,
    tieneCuaderno,
    superior
}) => {
    const numDisp = numero && numero !== 'S/N' ? `N° ${numero}` : numero || '';
    switch (tipoNotificacion) {
        case 'DISPOSICIÓN':
        case 'PROVIDENCIA': {
            const base =
                tipoNotificacion === 'DISPOSICIÓN' && superior
                    ? 'DISPOSICIÓN SUPERIOR'
                    : tipoNotificacion;
            return `${base} ${numDisp}-${anio || ''}`.trim();
        }
        case 'RESOLUCIÓN':
            return `RESOLUCIÓN ${numDisp}-${anio || ''}${cuaderno ? ` DEL CUADERNO ${cuaderno}` : ''
                }`.trim();
        case 'ACTA':
            return `ACTA${tipoActa ? ` (${tipoActa})` : ''}${tieneCuaderno === 'SI' && cuaderno ? ` DEL CUADERNO ${cuaderno}` : ''
                }`.trim();
        case 'OFICIO':
        case 'CITACIÓN POLICIAL':
            return `${tipoNotificacion} ${numDisp}-${anio || ''}${lugar ? ` LUGAR ${lugar}` : ''
                }`.trim();
        case 'OTROS':
            return `OTROS ${numero || ''}`.trim();
        default:
            return `${tipoNotificacion}${numDisp ? ` ${numDisp}` : ''}`.trim();
    }
};

const autoFormatFecha = raw => {
    const clean = raw.replace(/[^\d]/g, '');
    if (clean.length <= 2) return clean;
    if (clean.length <= 4) return `${clean.slice(0, 2)}-${clean.slice(2)}`;
    return `${clean.slice(0, 2)}-${clean.slice(2, 4)}-${clean.slice(4, 8)}`;
};
const validateFecha = f =>
    /^(0?[1-9]|[12]\d|3[01])-(0?[1-9]|1[0-2])-\d{4}$/.test(f);

const autoFormatHora = r => {
    const clean = r.replace(/[^\d]/g, '');
    if (clean.length <= 2) return clean;
    return `${clean.slice(0, 2)}:${clean.slice(2, 4)}`;
};
const validateHora = h => /^(0?[1-9]|1[0-2]):[0-5]\d$/.test(h);

const digitsOnly = s => s.replace(/[^\d]/g, ''); // sólo números para el plazo

/* ═════════════ componente ═════════════ */

export default function BulkUpdateButton({
    registro,
    pdfFile = null,      // ← nuevo parámetro
    onUpdated,
    open,
    onClose
}) {


    /* ---------- estado e_situacional ---------- */
    const [editESituacional, setEditESituacional] = useState({
        tipoNotificacion: '',
        numero: '',
        sinNumero: false,
        cuaderno: '',
        lugar: '',
        tipoActa: '',
        tieneCuaderno: 'NO',
        superior: false,
        informacionEspecifica: ''
    });

    /* ---------- estado plazos ---------- */
    const [editForm, setEditForm] = useState({
        denunciado: '',
        fechaNotificacion: '',
        plazoTipo: '',    
        reprogramacion: 'NO',
        AmPm: '',
        /* requerimiento */
        accionRequerimiento: '',
        plazoRequerimiento: '',
        fechaRequerimiento: '',
        /* audiencia */
        accionAudiencia: '',
        horaAudiencia: '',
        fechaAudiencia: ''
    });

    const [errors, setErrors] = useState({
        fechaNotificacion: '',
        plazoRequerimiento: '',
        fechaRequerimiento: '',
        horaAudiencia: '',
        fechaAudiencia: ''
    });

    const [modoModPlazo, setModoModPlazo] = useState(false);

    /* ---------- historial (opcional, para refrescar) ---------- */
    const fetchHistorial = useCallback(
        debounce(async () => {
            if (!registro.registro_ppu) return;
            try {
                await axios.post('/api/historiales', {
                    registro_ppu: [registro.registro_ppu]
                });
            } catch {
                /* silencioso */
            }
        }, 300),
        [registro.registro_ppu]
    );

    /* ---------- al abrir el modal ---------- */
    useEffect(() => {
        if (!open) return;

        setEditESituacional({
            tipoNotificacion: '',
            numero: '',
            sinNumero: false,
            cuaderno: '',
            lugar: '',
            tipoActa: '',
            tieneCuaderno: 'NO',
            superior: false,
            informacionEspecifica: registro.e_situacional || ''
        });

        setEditForm({
            denunciado: registro.denunciado || '',
            fechaNotificacion: registro.fecha_notificacion || '',
            // Solo pre-selecciona el tipo si realmente existe en el registro;
            // de lo contrario queda vacío y NO dispara las validaciones de plazo.
            plazoTipo:
                registro.audiencia
                    ? 'AUDIENCIA'
                    : registro.plazo_atencion
                        ? 'REQUERIMIENTO'
                        : '',
            reprogramacion: registro.reprogramacion || 'NO',
            AmPm: registro.AmPm || '',
            accionRequerimiento: registro.accion || '',
            plazoRequerimiento: registro.plazo_atencion || '',
            fechaRequerimiento: registro.fecha_atencion || '',
            accionAudiencia: '',
            horaAudiencia: '',
            fechaAudiencia: ''
        });

        setErrors({
            fechaNotificacion: '',
            plazoRequerimiento: '',
            fechaRequerimiento: '',
            horaAudiencia: '',
            fechaAudiencia: ''
        });

        fetchHistorial();
    }, [open, registro, fetchHistorial]);

    /* ---------- handlers de cambios ---------- */
    const handleChangeES = field => e => {
        if (field === 'sinNumero') {
            const nuevoSin = !editESituacional.sinNumero;
            setEditESituacional(p => ({
                ...p,
                sinNumero: nuevoSin,
                numero: nuevoSin ? 'S/N' : ''
            }));
            return;
        }
        const value = e.target.type === 'checkbox'
            ? e.target.checked
            : e.target.value;
        setEditESituacional(p => ({ ...p, [field]: value }));
    };

    const handleChangeForm = field => e => {
        let value = e.target.value;

        if (
            ['fechaNotificacion', 'fechaRequerimiento', 'fechaAudiencia'].includes(field)
        ) {
            value = autoFormatFecha(value);
            setErrors(err => ({
                ...err,
                [field]: validateFecha(value) ? '' : 'dd-mm-aaaa'
            }));
        }

        if (field === 'horaAudiencia') {
            value = autoFormatHora(value);
            setErrors(err => ({
                ...err,
                horaAudiencia: validateHora(value) ? '' : 'hh:mm'
            }));
        }

        if (field === 'plazoRequerimiento') {
            value = digitsOnly(value);
            setErrors(err => ({
                ...err,
                plazoRequerimiento: value ? '' : 'números'
            }));
        }

        /* cuando es AMBOS copiamos la misma fecha */
        if (editForm.plazoTipo === 'AMBOS' && field === 'fechaAudiencia') {
            setEditForm(p => ({
                ...p,
                fechaAudiencia: value,
                fechaRequerimiento: value
            }));
            setErrors(err => ({
                ...err,
                fechaRequerimiento: validateFecha(value) ? '' : 'dd-mm-aaaa'
            }));
            return;
        }

        setEditForm(p => ({ ...p, [field]: value }));
    };

    /* ---------- submit ---------- */
    const handleSubmit = async () => {
        // 0) Generar fecha de ingreso en formato ISO YYYY-MM-DD
        const today = new Date().toISOString().slice(0, 10);

        // 1) Verificar que ya existe un registro_ppu
        if (!registro.registro_ppu) {
            alert('Primero guarda el caso para obtener el Registro PPU.');
            return;
        }

        // 2) Validaciones de errores de los inputs
        if (Object.values(errors).some(Boolean)) return;

        // 3) Validar que el plazo de requerimiento sea numérico SOLO si el usuario ha escrito algo
        if (
            ['REQUERIMIENTO', 'AMBOS'].includes(editForm.plazoTipo) &&
            editForm.plazoRequerimiento !== '' &&
            !digitsOnly(editForm.plazoRequerimiento)
        ) {
            setErrors(err => ({ ...err, plazoRequerimiento: 'números' }));
            return;
        }

        // 4) Sincronizar fechas cuando el tipo es AMBOS
        if (editForm.plazoTipo === 'AMBOS') {
            editForm.fechaRequerimiento = editForm.fechaAudiencia;
        }

        /* ---------- armado de e_situacional ---------- */
        const prefix = buildImmutablePrefix(editESituacional);
        const eSituFinal =
            prefix +
            (editESituacional.informacionEspecifica
                ? ' : ' + editESituacional.informacionEspecifica
                : '');

        /* ---------- datos comunes ---------- */
        const base = {
            registro_ppu: registro.registro_ppu,
            e_situacional: eSituFinal,
            denunciado: editForm.denunciado,
            fecha_ingreso: today,
            reprogramacion: editForm.reprogramacion,
            ...(editForm.fechaNotificacion && { fecha_atencion: editForm.fechaNotificacion })
        }

        /* ---------- construcción del payload ---------- */
        let registros;

        switch (editForm.plazoTipo) {
            case 'AUDIENCIA':
                registros = [
                    {
                        ...base,
                        tipoPlazo: 'AUDIENCIA',
                        audiencia: true,
                        accion:
                            editForm.accionAudiencia +
                            (editForm.reprogramacion === 'SI' ? ' -REPROGRAMADA' : ''),
                        plazo_atencion: `${editForm.fechaAudiencia} ${editForm.horaAudiencia} ${editForm.AmPm}`,
                        fecha_atencion: editForm.fechaNotificacion
                    }
                ];
                break;

            case 'REQUERIMIENTO':
                registros = [
                    {
                        ...base,
                        tipoPlazo: 'REQUERIMIENTO',
                        audiencia: false,
                        accion: editForm.accionRequerimiento,
                        plazo_atencion: editForm.plazoRequerimiento
                        // fecha_atencion la ignora el backend en requerimientos
                    }
                ];
                break;

            case 'AMBOS': {
                const aud = {
                    ...base,
                    tipoPlazo: 'AUDIENCIA',
                    audiencia: true,
                    accion:
                        editForm.accionAudiencia +
                        (editForm.reprogramacion === 'SI' ? ' -REPROGRAMADA' : ''),
                    plazo_atencion: `${editForm.fechaAudiencia} ${editForm.horaAudiencia} ${editForm.AmPm}`
                };
                const req = {
                    ...base,
                    tipoPlazo: 'REQUERIMIENTO',
                    audiencia: false,
                    accion: editForm.accionRequerimiento,
                    plazo_atencion: editForm.plazoRequerimiento
                };
                registros = [aud, req];
                break;
            }

            default:
                /* Sin plazo: solo actualizamos e_situacional y campos comunes */
                registros = [{ ...base }];
        }

        /* ---------- envío al backend ---------- */
        try {
            if (pdfFile) {
                const form = new FormData();
                form.append('pdfs', pdfFile, pdfFile.name);
                form.append('registros', JSON.stringify(registros));
                await axios.post('/api/bulk_update', form);
            } else {
                await axios.post('/api/bulk_update', { registros });
            }

            alert('¡Registro guardado correctamente!');
            onUpdated?.();
            onClose();
        } catch (err) {
            alert(`Error: ${err.response?.data?.error || err.message}`);
        }
    };
    /* ---------- helper: toggle radio ---------- */
    const handleToggleRadio = field => (_, value) => {
        setEditForm(f => ({
            ...f,
            [field]: f[field] === value ? '' : value          // segundo clic → vacío
        }));
    };

    /* ═════════════ UI ═════════════ */

    return (
        <Modal open={open} onClose={onClose}>
            <Box
                sx={{
                    position: 'fixed',
                    inset: 0,
                    bgcolor: 'background.paper',
                    display: 'flex',
                    overflow: 'auto'
                }}
            >
                <Box flex={1} p={2}>
                    <Button
                        variant="outlined"
                        onClick={() => setModoModPlazo(!modoModPlazo)}
                        sx={{ mb: 2 }}
                    >
                        {modoModPlazo ? 'Salir Modo Plazo' : 'Modo Modificación de Plazo'}
                    </Button>

                    <Typography variant="h6" gutterBottom>
                        Editar Registro {registro.registro_ppu}
                    </Typography>

                    {/* ───────── BLOQUE e_situacional ───────── */}
                    <FormControl fullWidth margin="dense">
                        <FormLabel>Tipo de Notificación</FormLabel>
                        <RadioGroup
                            row
                            value={editESituacional.tipoNotificacion}
                            onChange={handleChangeES('tipoNotificacion')}
                            disabled={modoModPlazo}
                        >
                            {[
                                'RESOLUCIÓN',
                                'DISPOSICIÓN',
                                'PROVIDENCIA',
                                'OFICIO',
                                'CITACIÓN POLICIAL',
                                'CEDULA',
                                'ACTA',
                                'OTROS'
                            ].map(v => (
                                <FormControlLabel key={v} value={v} control={<Radio />} label={v} />
                            ))}
                        </RadioGroup>
                    </FormControl>

                    {/* condicionales según tipo */}
                    {['DISPOSICIÓN', 'PROVIDENCIA'].includes(editESituacional.tipoNotificacion) && (
                        <Box display="flex" gap={1} alignItems="center" mb={2}>
                            <TextField
                                label="Número"
                                fullWidth
                                margin="dense"
                                disabled={modoModPlazo || editESituacional.sinNumero}
                                value={editESituacional.numero}
                                InputProps={{
                                    startAdornment: !editESituacional.sinNumero && (
                                        <InputAdornment position="start">N°</InputAdornment>
                                    )
                                }}
                                onChange={handleChangeES('numero')}
                            />
                            <TextField
                                label="Año"
                                type="number"
                                fullWidth
                                margin="dense"
                                disabled={modoModPlazo}
                                value={editESituacional.anio}
                                onChange={handleChangeES('anio')}
                            />
                            <Button
                                variant="outlined"
                                size="small"
                                disabled={modoModPlazo}
                                onClick={handleChangeES('sinNumero')}
                            >
                                {editESituacional.sinNumero ? 'Con número' : 'Sin número?'}
                            </Button>
                            {editESituacional.tipoNotificacion === 'DISPOSICIÓN' && (
                                <FormControlLabel
                                    control={
                                        <Checkbox
                                            checked={editESituacional.superior}
                                            disabled={modoModPlazo}
                                            onChange={handleChangeES('superior')}
                                        />
                                    }
                                    label="SUPERIOR"
                                />
                            )}
                        </Box>
                    )}



                    {editESituacional.tipoNotificacion === 'ACTA' && (
                        <>
                            <TextField
                                label="Tipo de Acta"
                                fullWidth
                                margin="dense"
                                disabled={modoModPlazo}
                                value={editESituacional.tipoActa}
                                onChange={handleChangeES('tipoActa')}
                            />
                            <FormControl margin="dense" disabled={modoModPlazo}>
                                <FormLabel>¿Tiene Cuaderno?</FormLabel>
                                <RadioGroup
                                    row
                                    value={editESituacional.tieneCuaderno}
                                    onChange={handleChangeES('tieneCuaderno')}
                                >
                                    <FormControlLabel value="SI" control={<Radio />} label="Sí" />
                                    <FormControlLabel value="NO" control={<Radio />} label="No" />
                                </RadioGroup>
                            </FormControl>
                            {editESituacional.tieneCuaderno === 'SI' && (
                                <TextField
                                    label="Cuaderno"
                                    type="number"
                                    fullWidth
                                    margin="dense"
                                    disabled={modoModPlazo}
                                    value={editESituacional.cuaderno}
                                    onChange={handleChangeES('cuaderno')}
                                />
                            )}
                        </>
                    )}

                    {['OFICIO', 'CITACIÓN POLICIAL'].includes(
                        editESituacional.tipoNotificacion
                    ) && (
                            <>
                                <TextField
                                    label="Número"
                                    type="number"
                                    fullWidth
                                    margin="dense"
                                    disabled={modoModPlazo}
                                    value={editESituacional.numero}
                                    onChange={handleChangeES('numero')}
                                />
                                <TextField
                                    label="Año"
                                    type="number"
                                    fullWidth
                                    margin="dense"
                                    disabled={modoModPlazo}
                                    value={editESituacional.anio}
                                    onChange={handleChangeES('anio')}
                                />
                                <TextField
                                    label="Lugar"
                                    fullWidth
                                    margin="dense"
                                    disabled={modoModPlazo}
                                    value={editESituacional.lugar}
                                    onChange={handleChangeES('lugar')}
                                />
                            </>
                        )}

                    {editESituacional.tipoNotificacion === 'OTROS' && (
                        <TextField
                            label="Título Exacto"
                            fullWidth
                            margin="dense"
                            disabled={modoModPlazo}
                            value={editESituacional.numero}
                            onChange={handleChangeES('numero')}
                        />
                    )}

                    {['RESOLUCIÓN', 'CEDULA'].includes(
                        editESituacional.tipoNotificacion
                    ) && (
                            <>
                                <TextField
                                    label="Número"
                                    type="number"
                                    fullWidth
                                    margin="dense"
                                    disabled={modoModPlazo}
                                    value={editESituacional.numero}
                                    onChange={handleChangeES('numero')}
                                />
                                <TextField
                                    label="Año"
                                    type="number"
                                    fullWidth
                                    margin="dense"
                                    disabled={modoModPlazo}
                                    value={editESituacional.anio}
                                    onChange={handleChangeES('anio')}
                                />
                                {editESituacional.tipoNotificacion === 'RESOLUCIÓN' && (
                                    <TextField
                                        label="Cuaderno"
                                        type="number"
                                        fullWidth
                                        margin="dense"
                                        disabled={modoModPlazo}
                                        value={editESituacional.cuaderno}
                                        onChange={handleChangeES('cuaderno')}
                                    />
                                )}
                            </>
                        )}

                    <TextField
                        label="Información Específica"
                        fullWidth
                        multiline
                        rows={3}
                        margin="dense"
                        disabled={modoModPlazo}
                        value={editESituacional.informacionEspecifica}
                        onChange={handleChangeES('informacionEspecifica')}
                    />

                    <Box
                        mt={2}
                        p={2}
                        sx={{
                            border: '1px dashed #aaa',
                            borderRadius: 1,
                            bgcolor: '#fafafa'
                        }}
                    >
                        <Typography variant="subtitle1" gutterBottom>
                            Vista previa e_situacional
                        </Typography>
                        <Typography variant="body2">
                            {(() => {
                                const prefix = buildImmutablePrefix(editESituacional);
                                return `${prefix
                                    }${editESituacional.informacionEspecifica ? ' : ' + editESituacional.informacionEspecifica : ''}`;
                            })()}
                        </Typography>
                    </Box>

                    {/* ───────── BLOQUE PLAZOS ───────── */}
                    <TextField
                        label="Fecha de la Notificación (dd-mm-aaaa)"
                        fullWidth
                        margin="dense"
                        value={editForm.fechaNotificacion}
                        onChange={handleChangeForm('fechaNotificacion')}
                        error={!!errors.fechaNotificacion}
                        helperText={errors.fechaNotificacion}
                    />

                    <FormControl fullWidth margin="dense">
                        <FormLabel>Tipo de Plazo</FormLabel>
                        <RadioGroup row value={editForm.plazoTipo}>
                            {['AUDIENCIA', 'REQUERIMIENTO', 'AMBOS'].map(val => (
                                <FormControlLabel
                                    key={val}
                                    value={val}
                                    label={val.charAt(0) + val.slice(1).toLowerCase()} /* Audiencia, etc. */
                                    control={
                                        <Radio
                                            onClick={() =>
                                                setEditForm(f => ({
                                                    ...f,
                                                    plazoTipo: f.plazoTipo === val ? '' : val
                                                }))
                                            }
                                        />
                                    }
                                />
                            ))}
                        </RadioGroup>
                    </FormControl>


                    {/* AUDIENCIA */}
                    {['AUDIENCIA', 'AMBOS'].includes(editForm.plazoTipo) && (
                        <>
                            <Typography variant="subtitle1" sx={{ mt: 2 }}>
                                Audiencia
                            </Typography>
                            <TextField
                                label="Acción – Audiencia"
                                fullWidth
                                margin="dense"
                                value={editForm.accionAudiencia}
                                onChange={handleChangeForm('accionAudiencia')}
                            />
                            <TextField
                                label="Hora (hh:mm)"
                                fullWidth
                                margin="dense"
                                value={editForm.horaAudiencia}
                                onChange={handleChangeForm('horaAudiencia')}
                                error={!!errors.horaAudiencia}
                                helperText={errors.horaAudiencia}
                            />
                            <TextField
                                label="Fecha Audiencia (dd-mm-aaaa)"
                                fullWidth
                                margin="dense"
                                value={editForm.fechaAudiencia}
                                onChange={handleChangeForm('fechaAudiencia')}
                                error={!!errors.fechaAudiencia}
                                helperText={errors.fechaAudiencia}
                            />
                            <FormControl fullWidth margin="dense">
                                <FormLabel>AM / PM</FormLabel>
                                <RadioGroup
                                    row
                                    value={editForm.AmPm}
                                    onChange={e =>
                                        setEditForm(f => ({ ...f, AmPm: e.target.value }))
                                    }
                                >
                                    <FormControlLabel value="AM" control={<Radio />} label="AM" />
                                    <FormControlLabel value="PM" control={<Radio />} label="PM" />
                                </RadioGroup>
                            </FormControl>
                        </>
                    )}

                    {/* REQUERIMIENTO */}
                    {['REQUERIMIENTO', 'AMBOS'].includes(editForm.plazoTipo) && (
                        <>
                            <Typography variant="subtitle1" sx={{ mt: 3 }}>
                                Requerimiento
                            </Typography>
                            <TextField
                                label="Acción – Requerimiento"
                                fullWidth
                                margin="dense"
                                value={editForm.accionRequerimiento}
                                onChange={handleChangeForm('accionRequerimiento')}
                            />
                            <TextField
                                label="Plazo (días)"
                                fullWidth
                                margin="dense"
                                value={editForm.plazoRequerimiento}
                                onChange={handleChangeForm('plazoRequerimiento')}
                                error={!!errors.plazoRequerimiento}
                                helperText={errors.plazoRequerimiento}
                                inputProps={{ inputMode: 'numeric', pattern: '[0-9]*' }}
                            />
                        </>
                    )}



                    {['AUDIENCIA', 'AMBOS'].includes(editForm.plazoTipo) && (
                        <FormControl fullWidth margin="dense">
                            <FormLabel>Reprogramación</FormLabel>
                            <RadioGroup
                                row
                                value={editForm.reprogramacion}
                                onChange={e =>
                                    setEditForm(f => ({ ...f, reprogramacion: e.target.value }))
                                }
                            >
                                <FormControlLabel value="SI" control={<Radio />} label="Sí" />
                                <FormControlLabel value="NO" control={<Radio />} label="No" />
                            </RadioGroup>
                        </FormControl>
                    )}


                    {/* botones */}
                    <Box mt={2} display="flex" justifyContent="flex-end" gap={1}>
                        <Button variant="outlined" onClick={onClose}>
                            Cancelar
                        </Button>
                        <Button variant="contained" onClick={handleSubmit}>
                            Guardar
                        </Button>
                    </Box>
                </Box>
            </Box>
        </Modal>
    );
}
