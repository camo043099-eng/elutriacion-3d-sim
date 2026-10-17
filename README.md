# Simulador 3D de Elutriación Hidráulica Multietapa

Simulación interactiva en 3D y en tiempo real de un **elutriador hidráulico de dos columnas en serie**: un clasificador que separa partículas sólidas por tamaño y densidad usando una corriente ascendente de agua. El simulador combina un modelo hidrodinámico basado en la **Ley de Stokes**, una vista 3D del equipo con cientos de partículas en movimiento, las ecuaciones del modelo con sustitución numérica en vivo y un **escáner granulométrico por cámara** para alimentar la simulación con un sólido real.

## 🚀 Cómo ejecutarlo

* **En el navegador:** abre el enlace de GitHub Pages del repositorio (sección *Environments / Pages*).
* **En local:** descarga el repositorio completo (*Code → Download ZIP*), descomprímelo y abre `index.html` con doble clic en Chrome, Edge, Firefox o Safari.
  * Las ecuaciones (KaTeX) y la telemetría están incluidas en el repositorio y funcionan sin conexión.
  * `index.html` necesita la carpeta `js/` a su lado (contiene el motor físico); si falta, la página lo indica.
  * El motor 3D (Three.js r128) se carga desde un CDN, por lo que la vista 3D necesita internet. Sin conexión, la página lo indica y el resto sigue funcionando.
  * La cámara en vivo del escáner necesita el permiso del navegador; en el móvil funciona abriendo la página desde GitHub Pages (`https://`).

## 📁 Estructura del repositorio

| Archivo | Contenido |
|---|---|
| `index.html` | Interfaz, vista 3D (Three.js), ecuaciones en vivo (KaTeX) y escáner granulométrico |
| `js/sim.js` | Motor físico sin dependencias: hidrodinámica, geometría del equipo y movimiento de partículas |
| `tests/contencion.test.js` | Pruebas automáticas del modelo físico y de la contención de partículas |
| `vendor/katex/` | KaTeX local para renderizar ecuaciones (licencia MIT) |

---

## ⚙️ Equipo simulado

El elutriador está formado por:

1. **Tolva de alimentación:** recibe la pulpa (sólido + agua) y la conduce por una tubería hasta la zona media de la columna 1.
2. **Columna 1 (alta velocidad, $D_1$):** el agua entra por la parte baja, sobre el cono. Las partículas gruesas sedimentan y caen por el cono hacia el **colector 1**.
3. **Tubo de interconexión:** el rebose de la columna 1 sale por un reductor superior, baja por un tubo exterior y entra por la parte baja de la columna 2.
4. **Columna 2 (baja velocidad, $D_2 > D_1$):** al ser más ancha, la velocidad del agua disminuye y sedimentan las partículas de tamaño medio, que caen al **colector 2**.
5. **Tanque de rebose:** recibe los finos que salen por la parte superior de la columna 2.

Todos los recipientes son transparentes, de modo que se ve el material acumulado en colectores y tanque. Debajo de cada entrada de agua el fluido está en reposo (zona de sedimentación), y en el reductor superior la velocidad aumenta por continuidad ($Q = v \cdot A$).

Las partículas **nunca atraviesan las paredes**: el motor limita su posición según la forma real de cada recipiente (incluidas las paredes inclinadas de conos, reductores y tolva), y dentro de las tuberías siguen exactamente la misma curva con la que se dibuja cada tubo.

Las partículas se colorean según su clase granulométrica:

| Color | Clase | Destino ideal |
|---|---|---|
| 🟠 Ámbar | Gruesos ($d_p \ge d_{pc1}$) | Colector 1 |
| 🔵 Cian | Medios ($d_{pc2} \le d_p < d_{pc1}$) | Colector 2 |
| 🟣 Magenta | Finos ($d_p < d_{pc2}$) | Tanque de rebose |

---

## 🔬 Modelo físico-matemático

La simulación sigue en tiempo real a $N = 480$ partículas esféricas polidispersas. Con la alimentación estándar los diámetros se distribuyen uniformemente entre $15\ \mu\mathrm{m}$ y $145\ \mu\mathrm{m}$; con un sólido escaneado se usa la distribución medida.

### 1. Velocidad terminal de sedimentación (Ley de Stokes)

Para una partícula de diámetro $d_p$ y densidad $\rho_p$ en un fluido de densidad $\rho_f$ y viscosidad dinámica $\mu$:

$$v_t = \frac{g \, d_p^2 \, (\rho_p - \rho_f)}{18 \, \mu}$$

### 2. Velocidad superficial ascendente

A caudal volumétrico constante $Q$, la velocidad media del agua en cada columna $i \in \{1, 2\}$ de diámetro interno $D_i$ es:

$$v_{fi} = \frac{Q}{A_i} = \frac{4 \, Q}{\pi \, D_i^2}$$

### 3. Balance vertical sobre la partícula

$$v_{\mathrm{neta}} = v_f(r) - v_t \qquad \begin{cases} v_{\mathrm{neta}} > 0 & \text{la partícula sube al rebose} \\ v_{\mathrm{neta}} < 0 & \text{la partícula sedimenta hacia la descarga} \end{cases}$$

### 4. Diámetro de corte

La condición de equisedimentación ($v_t = v_{fi}$) define el diámetro crítico de corte de cada columna:

$$d_{pci} = \sqrt{\frac{18 \, \mu \, v_{fi}}{g \, (\rho_p - \rho_f)}} \qquad \Rightarrow \qquad d_{pc} \propto \sqrt{v_f} \propto \frac{1}{D} \quad (Q \text{ constante})$$

El simulador calcula también el número de Reynolds de partícula en el corte y avisa cuando se sale del régimen de Stokes ($Re_p > 1$):

$$Re_p = \frac{\rho_f \, v_f \, d_{pc}}{\mu}$$

### 5. Perfil radial de velocidad (efecto pared)

* **Flujo pistón (por defecto):** la velocidad es uniforme en toda la sección, $v_f(r) = \bar{v}_f$.
* **Perfil parabólico de Poiseuille (opcional):** conserva el mismo caudal, pero el agua va más rápido en el centro y casi detenida junto a la pared:

$$v_f(r) = 2 \, \bar{v}_f \left[ 1 - \left(\frac{r}{R}\right)^2 \right]$$

Con este perfil algunas partículas finas cercanas a la pared sedimentan en lugar de subir, y la eficiencia de clasificación medida cae de cerca del 100 % a cerca del 80 %.

### 6. Corrección para $Re_p > 1$ (Schiller–Naumann, opcional)

Fuera del régimen de Stokes se usa el coeficiente de arrastre $C_D = \tfrac{24}{Re_p}\left(1 + 0.15\,Re_p^{0.687}\right)$, que equivale a:

$$v_t = \frac{v_{t,\mathrm{Stokes}}}{1 + 0.15 \, Re_p^{0.687}}$$

En ese caso el diámetro de corte se obtiene resolviendo numéricamente $v_t(d_{pc}) = v_f$ por bisección.

### 7. Dispersión axial (opcional)

Añade una componente aleatoria al movimiento vertical que representa la turbulencia del flujo. Con ella el corte deja de ser perfecto y aparecen partículas en salidas que no les corresponden.

### 8. Sólidos más ligeros que el agua

La densidad del sólido puede variar entre $500$ y $7500\ \mathrm{kg/m^3}$. Si $\rho_p \le \rho_f$, la velocidad terminal cambia de signo: la partícula experimenta **flotación natural** y asciende hacia el tanque de rebose sin importar su tamaño. El panel lo indica y muestra un diámetro de corte equivalente calculado con $|\rho_p - \rho_f|$.

### 9. Esfericidad

Cuando se usa un sólido escaneado, el escáner estima la esfericidad $\psi$ a partir de la circularidad 2D de los granos en la imagen ($4\pi A / P^2$), que es una aproximación de la esfericidad de Wadell (definida en 3D). Con ella se calcula un diámetro equivalente $d_{\mathrm{eq}} = d_p \sqrt{\psi}$, que es el que usa el simulador para cada partícula: así los granos irregulares sedimentan más lento que esferas del mismo tamaño aparente. Esta corrección es una aproximación propia del simulador, no una correlación de la bibliografía.

---

## 🎛️ Controles de la simulación

### Variables de operación
| Control | Rango | Valor base |
|---|---|---|
| Caudal de agua $Q$ | 0.50 – 4.00 L/min | 1.50 L/min |
| Densidad de partícula $\rho_p$ | 500 – 7500 kg/m³ | 2650 kg/m³ (cuarzo) |
| Viscosidad del fluido $\mu$ | 0.50 – 3.50 mPa·s | 1.00 mPa·s (agua a 20 °C) |
| Diámetro columna 1 $D_1$ | 4.00 – 9.00 cm | 5.95 cm |
| Diámetro columna 2 $D_2$ | 8.00 – 18.00 cm | 11.90 cm |

Accesos rápidos: **Diseño Base (1.5 L/min)**, **Arrastre (3.0 L/min)** y los sólidos **Biomasa (500)**, **Cuarzo (2650)**, **Barita (4500)** y **Galena (7500)**.

### Efectos hidrodinámicos
* Perfil parabólico (efecto pared)
* Dispersión axial
* Corrección para $Re_p > 1$ (Schiller–Naumann)
* Mostrar líneas de flujo ascendente (trazadores que se mueven con la velocidad local del agua)

### Vista 3D
* **Vista General 3D**, **Enfocar Columna 1**, **Enfocar Columna 2** y **Vista Planta**. La cámara también se puede girar, desplazar y acercar con el ratón o con gestos táctiles.
* **Reiniciar Pulso:** inyecta todas las partículas a la vez en la zona de alimentación de la columna 1.
* **Ocultar paneles:** deja solo la vista 3D en pantalla.

---

## 📊 Resultados en vivo

* **Telemetría hidrodinámica:** $v_{f1}$, $v_{f2}$, $d_{pc1}$, $d_{pc2}$ y $Re_p$ de cada columna, con el régimen de flujo (Stokes o intermedio).
* **Clasificación granulométrica:** para cada salida se muestra la fracción **teórica** (calculada con los diámetros de corte y la distribución de tamaños de la alimentación) y la fracción **medida** en las últimas 600 descargas reales de la simulación.
* **Eficiencia de clasificación:** porcentaje de partículas que llegó a su salida correcta. La medición se reinicia al cambiar un parámetro y se estabiliza en aproximadamente un minuto.
* **Ecuaciones del modelo:** se muestran renderizadas, resaltando las que están activas (perfil pistón o parabólico, corrección de Schiller–Naumann).
* **Sustitución numérica en vivo:** cada ecuación se presenta con los valores actuales de la columna seleccionada (pestañas *Columna 1* / *Columna 2*), en unidades SI.

---

## 📷 Escáner granulométrico por cámara (Análisis Digital de Imagen)

El botón **📷 Escanear Sólido** abre un módulo que mide la distribución de tamaños de un sólido real a partir de una imagen y la conecta al simulador.

**Fuentes de imagen:** cámara en vivo del móvil o del computador, foto tomada o subida desde el dispositivo, o una muestra sintética calibrada para pruebas. La imagen se puede congelar para analizarla con calma.

**Calibración:**
* *Ancho físico del recuadro azul* (0.8 – 15 mm), con ajustes rápidos para lente macro (1.8 mm), lente de clip (4.5 mm) y vista directa (12 mm). Con este valor se obtiene la resolución en µm/px.
* *Umbral de contraste* para binarizar la imagen, y la opción de granos oscuros sobre fondo claro o granos claros sobre fondo oscuro.

**Procesamiento:**
1. Se binariza la región del recuadro y se identifican los granos como regiones conectadas, descartando los que tocan el borde.
2. Para cada grano se calcula el diámetro de círculo equivalente, $d_p = 2\sqrt{A/\pi}$, y la circularidad $4\pi A / P^2$ como estimación de la esfericidad $\psi$.
3. Se obtienen el número de partículas $N$, los percentiles $d_{10}$, $d_{50}$ y $d_{90}$, la esfericidad media y un histograma de tamaños.
4. Se proponen los cortes $d_{pc1} = P_{67}$ y $d_{pc2} = P_{33}$, que dividen la muestra en tres fracciones similares.

**Receta de elutriación:** con la densidad elegida para el sólido (biomasa, polipropileno, nylon, carbón, cuarzo, caliza, barita, magnetita o galena), el escáner calcula $Q$, $D_1$ y $D_2$ con **las mismas ecuaciones del simulador** (función `designRecipe` de `js/sim.js`): usa la Ley de Stokes y, si $Re_p > 1$, la corrección de Schiller–Naumann. Mantiene $D_1 = 5.95$ cm siempre que el caudal quede entre 0.50 y 4.00 L/min; si no, ajusta $D_1$ (4–9 cm) para lograr el corte. Si algún valor queda fuera del rango del equipo, lo avisa y muestra los cortes que realmente se obtendrán. Si el sólido es más ligero que el agua, advierte que flotará.

**Conectar al simulador:** el botón **🚀 Conectar Datos al Simulador 3D y Ejecutar Elutriación** aplica la receta (caudal, diámetros, densidad y corrección), reemplaza la alimentación por la distribución de tamaños medida y lanza un pulso. Mientras está activo se muestra el aviso *Sólido Escaneado Activo*; **Restaurar alimentación estándar** vuelve a la distribución uniforme de 15 – 145 µm.

---

## 🧪 Pruebas automáticas

Con [Node.js](https://nodejs.org) instalado, desde la carpeta del repositorio:

```bash
node tests/contencion.test.js
```

Las pruebas verifican:
* Los valores del caso base: $v_{f1} = 8.99$ mm/s, $v_{f2} = 2.25$ mm/s, $d_{pc1} = 100.0\ \mu\mathrm{m}$, $d_{pc2} = 50.0\ \mu\mathrm{m}$ y $Re_{p1} \approx 0.90$; con galena, $d_{pc1} \approx 50.4\ \mu\mathrm{m}$.
* Que la corrección de Schiller–Naumann reduzca la velocidad terminal y sea coherente con el diámetro de corte calculado.
* Que **ninguna partícula salga** de columnas, conos, reductores, tuberías, tolva, colectores o tanque en distintos escenarios: caudales extremos, sólidos densos (galena) y ligeros (biomasa, polipropileno), perfil parabólico, dispersión, cambio de diámetros durante la operación y reinicio de pulso.
* Que con flujo pistón la clasificación sea prácticamente perfecta y que el perfil parabólico reduzca la nitidez del corte.
* Que con un **sólido escaneado** cada partícula se mueva con la velocidad terminal de su propio diámetro, y que lo medido coincida con lo teórico.
* Que la **receta del escáner** sea coherente con el simulador (mismas $v_f$ y $d_{pc}$), respete los rangos de los controles y avise cuando no pueda lograr un corte.

---

## 📚 Referencias bibliográficas

* Chhabra, R., & Basavaraj, M. G. (2019). *Coulson and Richardson's Chemical Engineering: Volume 2A: Particulate Systems and Particle Technology* (6th ed.). Butterworth-Heinemann.
* Geankoplis, C. J. (2006). *Procesos de transporte y principios de procesos de separación* (4.ª ed.). CECSA.
* Green, D. W., & Southard, M. Z. (Eds.). (2019). *Perry's Chemical Engineers' Handbook* (9th ed.). McGraw-Hill Education.
* McCabe, W. L., Smith, J. C., & Harriott, P. (2007). *Operaciones unitarias en ingeniería química* (7.ª ed.). McGraw-Hill Interamericana.
* Schiller, L., & Naumann, A. (1933). Über die grundlegenden Berechnungen bei der Schwerkraftaufbereitung. *Zeitschrift des Vereines Deutscher Ingenieure*, 77, 318–320.
* Wadell, H. (1935). Volume, shape, and roundness of quartz particles. *The Journal of Geology*, 43(3), 250–280.
* Wills, B. A., & Finch, J. A. (2016). *Wills' Mineral Processing Technology* (8th ed.). Butterworth-Heinemann.
