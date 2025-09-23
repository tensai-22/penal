const { exec } = require('child_process');

exec('npm start', (err, stdout, stderr) => {
    if (err) {
        console.error(`Error al ejecutar: ${err.message}`);
        return;
    }
    if (stderr) {
        console.error(`Error del proceso: ${stderr}`);
        return;
    }
    console.log(`Salida del servidor:\n${stdout}`);
});
