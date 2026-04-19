import React from 'react'

/**
 * Componente Modal Universal
 * @param {boolean} show - Controla la visibilidad.
 * @param {string} type - 'primary', 'danger', 'success', 'info'.
 * @param {string} icon - Clase de Bootstrap Icon (ej: 'bi-trash').
 * @param {string} title - Título del modal.
 * @param {string} text - Descripción o cuerpo del mensaje.
 * @param {object} confirmBtn - { text, className, onClick }
 * @param {object} cancelBtn - { text, className, onClick }
 * @param {boolean} isInfoOnly - Si es true, solo muestra un botón de 'Entendido'.
 * @param {boolean} isLoading - Si es true, muestra un spinner y oculta botones.
 */
function Modal({
    show,
    type = 'primary',
    icon = 'bi-info-circle',
    title,
    text,
    confirmBtn,
    cancelBtn,
    isInfoOnly = false,
    isLoading = false
}) {
    if (!show) return null;

    return (
        <div className={`modal-overlay show`}>
            <div className={`modal-content-custom modal-${type} text-center animate__animated animate__fadeIn`}>
                {isLoading ? (
                    <div className="py-4">
                        <div className="spinner-border text-primary mb-4" style={{ width: '3rem', height: '3rem' }} role="status">
                            <span className="visually-hidden">Cargando...</span>
                        </div>
                        <h3 className="modal-title-custom">{title || 'Cargando...'}</h3>
                        <p className="modal-text-custom mb-0">{text || 'Por favor, espera un momento.'}</p>
                    </div>
                ) : (
                    <>
                        <div className="modal-icon-container">
                            <i className={`bi ${icon}`}></i>
                        </div>

                        <h3 className="modal-title-custom">{title}</h3>
                        <p className="modal-text-custom">{text}</p>

                        <div className="modal-footer-custom">
                            {isInfoOnly ? (
                                <button
                                    className="btn btn-primary"
                                    onClick={confirmBtn?.onClick}
                                >
                                    {confirmBtn?.text || 'Entendido'}
                                </button>
                            ) : (
                                <>
                                    <button
                                        className={`btn ${cancelBtn?.className || 'btn-light'}`}
                                        onClick={cancelBtn?.onClick}
                                    >
                                        {cancelBtn?.text || 'Cancelar'}
                                    </button>
                                    <button
                                        className={`btn ${confirmBtn?.className || 'btn-primary'}`}
                                        onClick={confirmBtn?.onClick}
                                    >
                                        {confirmBtn?.text || 'Confirmar'}
                                    </button>
                                </>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

export default Modal
