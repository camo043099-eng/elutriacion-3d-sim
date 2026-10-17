# Simulador 3D en Tiempo Real: Elutriación Hidráulica Multietapa

Repositorio oficial de simulación interactiva en 3D desarrollado para el **Tema 3: Elutriación: fundamentos y aplicaciones** (Entrega límite: 20 de octubre de 2026).

## 🚀 Ejecución Directa
1. **En el navegador (GitHub Pages):** Accede al enlace publicado en la sección *Environments / Pages* de este repositorio.
2. **En local:** Descarga el repositorio completo (botón *Code → Download ZIP*), descomprímelo y abre `index.html` con doble clic en cualquier navegador moderno (Chrome, Edge, Firefox o Safari).
   * Las **ecuaciones** (KaTeX) y la **telemetría** están incluidas en el repositorio y funcionan sin conexión.
   * El **motor 3D** (Three.js r128) se descarga de un CDN, así que la vista 3D necesita internet. Si no hay conexión, la página lo indica y el resto sigue funcionando.

## 📁 Estructura

| Archivo | Contenido |
|---|---|
| `index.html` | Interfaz, vista 3D (Three.js) y ecuaciones en vivo (KaTeX) |
| `js/sim.js` | Motor físico sin dependencias: hidrodinámica, geometría del equipo y movimiento de partículas |
| `tests/contencion.test.js` | Pruebas automáticas (física + contención de partículas) |
| `vendor/katex/` | KaTeX 0.16 local (licencia MIT) |

---

## 🔬 Modelo Físico-Matemático Implementado

El motor físico calcula en tiempo real el balance de fuerzas sobre $N = 480$ partículas esféricas polidispersas ($15\ \mu\mathrm{m} \le d_p \le 145\ \mu\mathrm{m}$, distribución uniforme) dentro de dos columnas cilíndricas conectadas en serie.

### 1. Velocidad Terminal de Sedimentación (Ley de Stokes)
Para cada partícula de diámetro $d_p$ y densidad $\rho_p$ sumergida en un fluido de densidad $\rho_f$ y viscosidad dinámica $\mu$:

$$v_t = \frac{g \, d_p^2 \, (\rho_p - \rho_f)}{18 \, \mu}$$

### 2. Velocidad Superficial Ascendente y Diámetro de Corte ($d_{pc}$)
A caudal volumétrico constante $Q$, la velocidad ascendente en cada etapa $i \in \{1, 2\}$ con diámetro interno $D_i$ es:

$$v_{fi} = \frac{4 \, Q}{\pi \, D_i^2}$$

La condición de equisedimentación estacionaria ($v_{\mathrm{neta}} = v_{fi} - v_t = 0$) define el diámetro crítico de corte en cada columna:

$$d_{pci} = \sqrt{\frac{18 \, \mu \, v_{fi}}{g \, (\rho_p - \rho_f)}}$$

El simulador muestra además el número de Reynolds de partícula en el corte, $Re_p = \rho_f \, v_f \, d_{pc} / \mu$, y avisa cuando $Re_p > 1$ (fuera del régimen de Stokes).

### 3. Efecto de Pared (Perfil Parabólico de Velocidad)
Al activar **"Perfil parabólico (efecto pared)"**, el flujo pistón ideal se sustituye por el perfil laminar de Poiseuille, que conserva el mismo caudal ($\bar{v}_f$ es la velocidad media):

$$v_f(r) = 2 \, \bar{v}_f \left[ 1 - \left(\frac{r}{R}\right)^2 \right]$$

Así se observa por qué algunas partículas finas cercanas a las paredes descienden en vez de ascender, y la **eficiencia de clasificación medida** cae de ≈100 % a ≈80 %.

### 4. Corrección para $Re_p > 1$ (opcional)
Con **"Corrección para $Re_p > 1$"** se usa el arrastre de Schiller–Naumann ($C_D = \tfrac{24}{Re_p}(1 + 0.15\,Re_p^{0.687})$), equivalente a:

$$v_t = \frac{v_{t,\mathrm{Stokes}}}{1 + 0.15 \, Re_p^{0.687}}$$

y el diámetro de corte se obtiene resolviendo $v_t(d_{pc}) = v_f$ numéricamente.

### 5. Detalles del equipo simulado
* La pulpa entra a la columna 1 desde una **tolva de alimentación**; el agua entra por la parte baja de la columna 1 (sobre el cono).
* El rebose de la columna 1 baja por un **tubo exterior** y entra por la parte baja de la columna 2; el rebose de la columna 2 va al **tanque de finos**.
* Bajo la entrada de agua el fluido está en reposo: las partículas que llegan allí sedimentan por el cono hacia un **colector de vidrio**, donde se ve el material acumulado.
* Las partículas **nunca atraviesan las paredes**: el motor limita su posición según la forma real de cada recipiente (incluidas las paredes inclinadas de conos y reductores), y dentro de los tubos siguen exactamente la misma curva con la que se dibuja el tubo.
* **Dispersión axial** (opcional): agrega turbulencia, de modo que el corte deja de ser perfecto.

### 6. Resultados en vivo
Para cada salida se muestra la fracción **teórica** (a partir de $d_{pc1}$, $d_{pc2}$ y la distribución de tamaños) y la fracción **medida** en las últimas 600 descargas, además de la **eficiencia de clasificación** (porcentaje de partículas que llegó a su salida correcta). La medición se reinicia al cambiar un parámetro y se estabiliza en aproximadamente un minuto.

---

## 🎮 Guía de Demostración para la Exposición (25 min)

1. **Caso de Diseño Base ($Q = 1.50\ \mathrm{L/min}$, Cuarzo $\rho_p = 2650\ \mathrm{kg/m^3}$):**
   * En la **Columna 1** ($D_1 = 5.95\ \mathrm{cm}$), la velocidad ascendente es $8.99\ \mathrm{mm/s}$, reteniendo en el colector inferior las partículas gruesas (**ámbar**, $d_p > 100\ \mu\mathrm{m}$).
   * Las partículas menores a $100\ \mu\mathrm{m}$ suben por el tubo de interconexión hacia la **Columna 2** ($D_2 = 11.90\ \mathrm{cm}$), donde la velocidad cae a la cuarta parte ($2.25\ \mathrm{mm/s}$). Allí sedimentan las partículas intermedias (**cian**, $50\ \mu\mathrm{m} \le d_p \le 100\ \mu\mathrm{m}$).
   * Los ultrafinos (**magenta**, $d_p < 50\ \mu\mathrm{m}$) salen por el rebose hacia el tanque colector final.
2. **Efecto de la Densidad Mineral (Equisedimentación):**
   * Presiona el botón **Galena ($7500\ \mathrm{kg/m^3}$)**. El diámetro de corte cae de $100\ \mu\mathrm{m}$ a $50.4\ \mu\mathrm{m}$ en la primera etapa sin haber cambiado el caudal.
3. **Efecto Pared:**
   * Activa **Perfil parabólico** y espera ~1 minuto: la eficiencia de clasificación baja y aparecen finos en los colectores.
4. **Límite de la Ley de Stokes:**
   * Sube el caudal a $3.5\ \mathrm{L/min}$: $Re_p$ en la columna 1 supera 1 y el panel lo advierte. Activa la **corrección para $Re_p > 1$** y compara el nuevo $d_{pc1}$.
5. **Sustitución numérica:** en el panel derecho, *Sustitución numérica en vivo* muestra cada ecuación con los valores actuales (pestañas Columna 1 / Columna 2).

---

## 🧪 Pruebas

Con [Node.js](https://nodejs.org) instalado:

```bash
node tests/contencion.test.js
```

Verifican los valores del caso base, la corrección de Schiller–Naumann y que ninguna partícula salga de columnas, conos, tubos, tolva, colectores o tanque en distintos escenarios (caudales extremos, galena, cambio de diámetros en plena operación, reinicio de pulso).

---

## 📚 Referencias Bibliográficas

* Chhabra, R., & Basavaraj, M. G. (2019). *Coulson and Richardson's Chemical Engineering: Volume 2A: Particulate Systems and Particle Technology* (6th ed.). Butterworth-Heinemann.
* Geankoplis, C. J. (2006). *Procesos de transporte y principios de procesos de separación* (4.ª ed.). CECSA.
* Green, D. W., & Southard, M. Z. (Eds.). (2019). *Perry's Chemical Engineers' Handbook* (9th ed.). McGraw-Hill Education.
* McCabe, W. L., Smith, J. C., & Harriott, P. (2007). *Operaciones unitarias en ingeniería química* (7.ª ed.). McGraw-Hill Interamericana.
* Schiller, L., & Naumann, A. (1933). Über die grundlegenden Berechnungen bei der Schwerkraftaufbereitung. *Zeitschrift des Vereines Deutscher Ingenieure*, 77, 318–320.
* Wills, B. A., & Finch, J. A. (2016). *Wills' Mineral Processing Technology* (8th ed.). Butterworth-Heinemann.
