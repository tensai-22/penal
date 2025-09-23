// FiscaliaAutocomplete.js
import React from 'react';
import { Autocomplete, TextField, Popper } from '@mui/material';

const CustomPopper = (props) => {
    return (
        <Popper
            {...props}
            style={{ zIndex: 2000, ...props.style }} // Aumentar el z-index
            placement="bottom-start"
        />
    );
};

const FiscaliaAutocomplete = ({
    row,
    col,
    rindex,
    cindex,
    inputValues,
    setInputValues,
    fiscaliaOptionsTable,
    fetchFiscaliasTable,
    handleMinimalChange,
    setEditingCell,
    editingCell,
}) => {
    console.log("FiscaliaAutocomplete props:", {
        row,
        col,
        rindex,
        cindex,
        inputValues,
        fiscaliaOptionsTable,
        editingCell,
    });
    const isEditingThisCell = editingCell && editingCell.row === rindex && editingCell.col === cindex;
    const cellKey = `${rindex}-${col}`;
    const currentInputValue = inputValues[cellKey] !== undefined ? inputValues[cellKey] : row[col] || '';

    return (
        <Autocomplete
            options={fiscaliaOptionsTable}
            getOptionLabel={(option) => option.fiscalia}
            filterOptions={(options) => options} // Desactiva el filtrado interno
            onInputChange={(event, newInputValue, reason) => {
                setInputValues(prev => ({ ...prev, [cellKey]: newInputValue }));
                fetchFiscaliasTable(newInputValue);
            }}
            onChange={(event, newValue) => {
                if (newValue) {
                    handleMinimalChange(rindex, col, newValue.fiscalia);
                    setInputValues(prev => ({ ...prev, [cellKey]: newValue.fiscalia }));
                } else {
                    handleMinimalChange(rindex, col, row[col] || '');
                    setInputValues(prev => ({ ...prev, [cellKey]: row[col] || '' }));
                }
            }}
            inputValue={currentInputValue}
            renderInput={(params) => <TextField
                {...params}
                variant="standard"
                style={{
                    width: '200px',    // Ancho fijo
                    minWidth: '200px', // Ancho mínimo
                    maxWidth: '200px', // Ancho máximo
                }}
            />}
            freeSolo={false}
            disableClearable={true} // Elimina la opción de borrar    
            disablePortal={true} 
            PopperComponent={CustomPopper} // Utiliza el Popper personalizado
            onKeyDown={(e) => {
                if (e.key === 'Enter') {
                    e.preventDefault(); // Evita comportamientos por defecto
                    const matchedOption = fiscaliaOptionsTable.find(option => option.fiscalia.toLowerCase() === currentInputValue.toLowerCase());
                    if (matchedOption) {
                        handleMinimalChange(rindex, col, matchedOption.fiscalia);
                        setInputValues(prev => ({ ...prev, [cellKey]: matchedOption.fiscalia }));
                    } else {
                        handleMinimalChange(rindex, col, row[col] || '');
                        setInputValues(prev => ({ ...prev, [cellKey]: row[col] || '' }));
                    }
                    setEditingCell(null);
                }
            }}
            onBlur={() => {
                const isValid = fiscaliaOptionsTable.some(option => option.fiscalia.toLowerCase() === currentInputValue.toLowerCase());
                if (!isValid) {
                    handleMinimalChange(rindex, col, row[col] || '');
                    setInputValues(prev => ({ ...prev, [cellKey]: row[col] || '' }));
                }
            }}
        />
    );
};

export default FiscaliaAutocomplete;
