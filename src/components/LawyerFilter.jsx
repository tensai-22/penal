import React from 'react';
import { FormControl, InputLabel, Select, MenuItem, Typography } from '@mui/material';

const LawyerFilter = ({
    role,
    selectedAbogadoPlazos,
    setSelectedAbogadoPlazos,
    debouncedBuscarPlazosData,
    queryPlazos,
    mostrarArchivadosPlazos,
    username, // Eliminar el valor predeterminado
    setPagePlazos
}) => {
    return (
        <>
            {role === 'admin' ? (
                <FormControl variant="outlined" fullWidth>
                    <InputLabel>Filtrar por abogado</InputLabel>
                    <Select
                        value={selectedAbogadoPlazos}
                        onChange={(e) => {
                            const valorSeleccionado = e.target.value;
                            const valorFiltrado = valorSeleccionado.includes(';')
                                ? valorSeleccionado.split(';')[1].trim()
                                : valorSeleccionado;
                            setSelectedAbogadoPlazos(valorFiltrado);
                            setPagePlazos(1);
                            debouncedBuscarPlazosData(
                                1,
                                queryPlazos,
                                valorFiltrado,
                                mostrarArchivadosPlazos
                            );
                        }}
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
                        <MenuItem value="MARTINEZ">MARTINEZ</MenuItem>
                        <MenuItem value="FLORES">FLORES</MenuItem>
                        <MenuItem value="PALACIOS">PALACIOS</MenuItem>
                        <MenuItem value="POMAR">POMAR</MenuItem>
                        <MenuItem value="ROJAS">ROJAS</MenuItem>
                        <MenuItem value="FRISANCHO">FRISANCHO</MenuItem>
                        <MenuItem value="NAVARRO">NAVARRO</MenuItem>
                    </Select>
                </FormControl>
            ) : (
                <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
                    Abogado: {username ? username.toUpperCase() : 'DESCONOCIDO'} (filtro forzado)
                </Typography>
            )}
        </>
    );
};

export default LawyerFilter;
