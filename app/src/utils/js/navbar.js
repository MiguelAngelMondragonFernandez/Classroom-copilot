export const navbarItems = [
    {
        label: 'Inicio',
        icon: 'pi pi-home',
        url: '/'
    },
    {
        label: 'Planeador AI',
        icon: 'pi pi-bolt',
        url: '/planeacion-ciclo'
    },
    {
        label: 'Evaluaciones',
        icon: 'pi pi-check-square',
        url: '/actividades'
    },
    {
        label: 'Material AI',
        icon: 'pi pi-file-edit',
        url: '/generar-material'
    },
    {
        label: 'Gestión',
        icon: 'pi pi-briefcase',
        items: [
            {
                label: 'Unidades',
                icon: 'pi pi-calendar',
                url: '/configuracion-unidades'
            },
            {
                label: 'Horarios',
                icon: 'pi pi-clock',
                url: '/configuracion-horarios'
            },
            {
                label: 'Temario',
                icon: 'pi pi-list',
                url: '/temario'
            }
        ]
    }
];
