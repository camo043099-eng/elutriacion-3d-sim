# Simulador 3D en Tiempo Real: Elutriación Hidráulica Multietapa

Repositorio oficial de simulación interactiva en 3D desarrollado para el **Tema 3: Elutriación: fundamentos y aplicaciones** (Entrega límite: 20 de octubre de 2026).

## 🚀 Ejecución Directa
1. **En el navegador (GitHub Pages):** Accede al enlace publicado en la sección *Environments / Pages* de este repositorio.
2. **En local (Sin conexión a internet ni servidores):** Descarga el repositorio y abre el archivo `index.html` con doble clic en cualquier navegador moderno (Chrome, Edge, Firefox o Safari).

---

## 🔬 Modelo Físico-Matemático Implementado

El motor físico calcula a **60 fotogramas por segundo (FPS)** el balance de fuerzas sobre $N = 480$ partículas esféricas poli-dispersas ($15\text{ }\mu\text{m} \le d_p \le 145\text{ }\mu\text{m}$) dentro de dos columnas cilíndricas conectadas en serie.

### 1. Velocidad Terminal de Sedimentación (Ley de Stokes)
Para cada partícula de diámetro $d_p$ y densidad $\rho_p$ sumergida en un fluido de densidad $\rho_f$ y viscosidad dinámica $\mu$:

$$v_t = \frac{g \cdot d_p^2 \cdot (\rho_p - \rho_f)}{18 \cdot \mu}$$

### 2. Velocidad Superficial Ascendente y Diámetro de Corte ($d_{pc}$)
A caudal volumétrico constante $Q$, la velocidad ascendente en cada etapa $i \in \{1, 2\}$ con diámetro interno $D_i$ es:

$$v_{fi} = \frac{4 \cdot Q}{\pi \cdot D_i^2}$$

La condición de equisedimentación estacionaria ($v_{\text{neta}} = v_{fi} - v_t = 0$) define el diámetro crítico de corte en cada columna:

$$d_{pci} = \sqrt{\frac{18 \cdot \mu \cdot v_{fi}}{g \cdot (\rho_p - \rho_f)}}$$

### 3. Efecto de Pared (Perfil Parabólico de Velocidad)
Al activar la casilla **"Perfil Parabólico (Efecto Pared)"**, el simulador sustituye el flujo pistón ideal por un perfil radial laminar de Poiseuille:

$$v_f(r) = v_{f,\text{máx}} \left[ 1 - \left(\frac{r}{R}\right)^2 \right]$$

Esto permite observar visualmente por qué algunas partículas finas cercanas a las paredes del cilindro descienden en vez de ascender.

---

## 🎮 Guía de Demostración para la Exposición (25 min)

1. **Caso de Diseño Base ($Q = 1.50\text{ L/min}$, Cuarzo $\rho_p = 2650\text{ kg/m}^3$):**
   * En la **Columna 1** ($D_1 = 5.95\text{ cm}$), la velocidad ascendente es $8.99\text{ mm/s}$, reteniendo en el colector inferior las partículas gruesas (**ámbar**, $d_p > 100\text{ }\mu\text{m}$).
   * Las partículas menores a $100\text{ }\mu\text{m}$ ascienden por el tubo de interconexión hacia la **Columna 2** ($D_2 = 11.90\text{ cm}$), donde la velocidad cae a la cuarta parte ($2.25\text{ mm/s}$). Allí sedimentan las partículas intermedias (**cian**, $50\text{ }\mu\text{m} \le d_p \le 100\text{ }\mu\text{m}$).
   * Los ultrafinos (**magenta**, $d_p < 50\text{ }\mu\text{m}$) salen por el rebose hacia el tanque colector final.
2. **Efecto de la Densidad Mineral (Equisedimentación):**
   * Presiona el botón **Galena ($7500\text{ kg/m}^3$)**. Observarás cómo el diámetro de corte cae drásticamente de $100\text{ }\mu\text{m}$ a $50.4\text{ }\mu\text{m}$ en la primera etapa sin haber cambiado el caudal.

---

## 📚 Referencias Bibliográficas

* Chhabra, R., & Basavaraj, M. G. (2019). *Coulson and Richardson's Chemical Engineering: Volume 2A: Particulate Systems and Particle Technology* (6th ed.). Butterworth-Heinemann.
* Geankoplis, C. J. (2006). *Procesos de transporte y principios de procesos de separación* (4.ª ed.). CECSA.
* Green, D. W., & Southard, M. Z. (Eds.). (2019). *Perry's Chemical Engineers' Handbook* (9th ed.). McGraw-Hill Education.
* McCabe, W. L., Smith, J. C., & Harriott, P. (2007). *Operaciones unitarias en ingeniería química* (7.ª ed.). McGraw-Hill Interamericana.
* Wills, B. A., & Finch, J. A. (2016). *Wills' Mineral Processing Technology* (8th ed.). Butterworth-Heinemann.