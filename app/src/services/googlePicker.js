/**
 * Servicio para manejar la integración con Google Picker API.
 * Permite a los usuarios seleccionar archivos de su Google Drive.
 */

const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;
const APP_ID = import.meta.env.VITE_GOOGLE_APP_ID;

let gapiInitialized = false;

/**
 * Carga la librería GAPI y el módulo picker.
 */
const loadGapi = () => {
    return new Promise((resolve, reject) => {
        if (typeof window.gapi === 'undefined') {
            return reject(new Error('GAPI no está cargado. Asegúrate de incluir el script en index.html'));
        }
        if (gapiInitialized) return resolve();

        window.gapi.load('client:picker', {
            callback: () => {
                gapiInitialized = true;
                resolve();
            },
            onerror: () => reject(new Error('Error al cargar Google Picker API'))
        });
    });
};

/**
 * Abre el selector de archivos de Google Drive.
 * @param {string} token - Token de acceso de Google obtenido desde AuthContext.
 * @returns {Promise<Array|null>} - Lista de archivos seleccionados o null si se canceló.
 */
export const openGooglePicker = async (token) => {
    if (!token) {
        throw new Error('Se requiere un token de Google válido');
    }

    try {
        await loadGapi();

        return new Promise((resolve) => {
            const view = new window.google.picker.DocsView(window.google.picker.ViewId.DOCS)
                .setIncludeFolders(true)
                .setSelectFolderEnabled(false);

            const picker = new window.google.picker.PickerBuilder()
                .setAppId(APP_ID)
                .setOAuthToken(token)
                .addView(view)
                .setDeveloperKey(API_KEY)
                .setOrigin(window.location.protocol + '//' + window.location.host)
                .setCallback((data) => {
                    if (data.action === window.google.picker.Action.PICKED) {
                        const files = data.docs.map(doc => ({
                            id: doc.id,
                            name: doc.name,
                            url: doc.url,
                            mimeType: doc.mimeType
                        }));
                        resolve(files);
                    } else if (data.action === window.google.picker.Action.CANCEL) {
                        resolve(null);
                    }
                })
                .build();

            picker.setVisible(true);
        });
    } catch (error) {
        console.error('Error al abrir Google Picker:', error);
        throw error;
    }
};
