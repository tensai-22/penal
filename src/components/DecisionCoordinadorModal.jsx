// DecisionCoordinadorModal.jsx
import React, { useState } from 'react';
import {
    Modal,
    Box,
    Typography,
    Button,
    TextField,
    Radio,
    RadioGroup,
    FormControlLabel,
    FormControl,
    FormLabel
} from '@mui/material';
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://10.50.5.49:5001/api';

const DecisionCoordinadorModal = ({ open, handleClose, consultaPPU }) => {
    const [operation, setOperation] = useState('');
    const [acumulacionValue, setAcumulacionValue] = useState('');
    const [palancaLegajo, setPalancaLegajo] = useState('');
    const [ingresoNuevoOption, setIngresoNuevoOption] = useState('');
    const [anio, setAnio] = useState('');
    const [error, setError] = useState('');

    const handleOperationChange = (e) => {
        setOperation(e.target.value);
        setError('');
    };

    const handleSubmit = async () => {
        if (!operation) {
            setError('Seleccione una operación.');
            return;
        }

        // Construir payload según la operación seleccionada
        let payload = { consulta_ppu: consultaPPU, operation };
        if (operation === 'ACUMULACION') {
            payload.acumulacionValue = acumulacionValue;
        } else if (operation === 'PALANCA') {
            payload.palancaLegajo = palancaLegajo;
        } else if (operation === 'INGRESO_NUEVO') {
            payload.ingresoNuevoOption = ingresoNuevoOption;
            payload.anio = anio;
        }

        try {
            const response = await axios.post(
                `${API_BASE_URL}/decision_coordinador`,
                payload,
                { withCredentials: true }
            );
            if (response.data.success) {
                alert('Operación completada.');
                handleClose();
            } else {
                alert(response.data.message || 'Error en la operación.');
            }
        } catch (err) {
            console.error(err);
            alert('Error en la comunicación con el servidor.');
        }
    };

    return (
        <Modal open={open} onClose={handleClose}>
            <Box
                sx={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: 500,
                    bgcolor: 'background.paper',
                    border: '2px solid #000',
                    boxShadow: 24,
                    p: 4
                }}
            >
                <Typography variant="h6" component="h2">
                    Decisión Coordinador
                </Typography>
                <FormControl component="fieldset" sx={{ mt: 2 }}>
                    <FormLabel component="legend">Seleccione Operación</FormLabel>
                    <RadioGroup row value={operation} onChange={handleOperationChange}>
                        <FormControlLabel value="ACUMULACION" control={<Radio />} label="Acumulación" />
                        <FormControlLabel value="INGRESO_NUEVO" control={<Radio />} label="Ingreso Nuevo" />
                        <FormControlLabel value="PALANCA" control={<Radio />} label="Palanca" />
                    </RadioGroup>
                </FormControl>

                {operation === 'ACUMULACION' && (
                    <TextField
                        label="Valor para Acumulación"
                        variant="outlined"
                        fullWidth
                        value={acumulacionValue}
                        onChange={(e) => setAcumulacionValue(e.target.value)}
                        sx={{ mt: 2 }}
                    />
                )}

                {operation === 'PALANCA' && (
                    <TextField
                        label="Número de Legajo"
                        variant="outlined"
                        fullWidth
                        value={palancaLegajo}
                        onChange={(e) => setPalancaLegajo(e.target.value)}
                        sx={{ mt: 2 }}
                    />
                )}

                {operation === 'INGRESO_NUEVO' && (
                    <>
                        <FormControl component="fieldset" sx={{ mt: 2 }}>
                            <FormLabel component="legend">Opción de Ingreso Nuevo</FormLabel>
                            <RadioGroup
                                row
                                value={ingresoNuevoOption}
                                onChange={(e) => setIngresoNuevoOption(e.target.value)}
                            >
                                <FormControlLabel value="DENUNCIA" control={<Radio />} label="Denuncia" />
                                <FormControlLabel value="LEGAJO" control={<Radio />} label="Legajo" />
                            </RadioGroup>
                        </FormControl>
                        <TextField
                            label="Año"
                            variant="outlined"
                            fullWidth
                            value={anio}
                            onChange={(e) => setAnio(e.target.value)}
                            sx={{ mt: 2 }}
                        />
                    </>
                )}

                {error && (
                    <Typography color="error" sx={{ mt: 2 }}>
                        {error}
                    </Typography>
                )}72454743

                <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 4 }}>
                    <Button variant="contained" onClick={handleSubmit}>
                        Enviar
                    </Button>
                    <Button variant="outlined" onClick={handleClose}>
                        Cancelar
                    </Button>
                </Box>
            </Box>
        </Modal>
    );
};

export default DecisionCoordinadorModal;
