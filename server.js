require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { Pool } = require('pg');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const { Resend } = require('resend');
const { OAuth2Client } = require('google-auth-library');

const app = express();

// Taxonomía del catálogo: categoría > subcategoría > tipo. Es la misma que
// se usa para clasificar cada producto en el panel (Catálogo > editar
// producto) y para armar el menú del sitio -- una sola fuente de verdad,
// para que un enlace del menú y la clasificación real de un producto
// siempre sean la misma cosa.
// Estados y municipios de México (INEGI) -- se usan para armar los
// selectores en cascada de Estado/Ciudad al registrar una zona de envío,
// para que sea una lista real y completa en vez de texto libre.
const ESTADOS_MUNICIPIOS_MX = {"Aguascalientes": ["Aguascalientes", "Asientos", "Calvillo", "Cosío", "El Llano", "Jesús María", "Pabellón de Arteaga", "Rincón de Romos", "San Francisco de los Romo", "San José de Gracia", "Tepezalá"], "Baja California": ["Ensenada", "Mexicali", "Playas de Rosarito", "San Felipe", "San Quintín", "Tecate", "Tijuana"], "Baja California Sur": ["Comondú", "La Paz", "Loreto", "Los Cabos", "Mulegé"], "Campeche": ["Calakmul", "Calkiní", "Campeche", "Candelaria", "Carmen", "Champotón", "Dzitbalché", "Escárcega", "Hecelchakán", "Hopelchén", "Palizada", "Seybaplaya", "Tenabo"], "Chiapas": ["Acacoyagua", "Acala", "Acapetahua", "Aldama", "Altamirano", "Amatenango de la Frontera", "Amatenango del Valle", "Amatán", "Arriaga", "Bejucal de Ocampo", "Bella Vista", "Benemérito de las Américas", "Berriozábal", "Bochil", "Cacahoatán", "Capitán Luis Ángel Vidal", "Catazajá", "Chalchihuitán", "Chamula", "Chanal", "Chapultenango", "Chenalhó", "Chiapa de Corzo", "Chiapilla", "Chicoasén", "Chicomuselo", "Chilón", "Cintalapa de Figueroa", "Coapilla", "Comitán de Domínguez", "Copainalá", "El Bosque", "El Parral", "El Porvenir", "Emiliano Zapata", "Escuintla", "Francisco León", "Frontera Comalapa", "Frontera Hidalgo", "Honduras de la Sierra", "Huehuetán", "Huitiupán", "Huixtla", "Huixtán", "Ixhuatán", "Ixtacomitán", "Ixtapa", "Ixtapangajoya", "Jiquipilas", "Jitotol", "Juárez", "La Concordia", "La Grandeza", "La Independencia", "La Libertad", "La Trinitaria", "Larráinzar", "Las Margaritas", "Las Rosas", "Mapastepec", "Maravilla Tenejapa", "Marqués de Comillas", "Mazapa de Madero", "Mazatán", "Metapa", "Mezcalapa", "Mitontic", "Montecristo de Guerrero", "Motozintla", "Nicolás Ruíz", "Ocosingo", "Ocotepec", "Ocozocoautla de Espinosa", "Ostuacán", "Osumacinta", "Oxchuc", "Palenque", "Pantelhó", "Pantepec", "Pichucalco", "Pijijiapan", "Pueblo Nuevo Solistahuacán", "Rayón", "Reforma", "Rincón Chamula San Pedro", "Sabanilla", "Salto de Agua", "San Andrés Duraznal", "San Cristóbal de las Casas", "San Fernando", "San Juan Cancuc", "San Lucas", "Santiago el Pinar", "Siltepec", "Simojovel", "Sitalá", "Socoltenango", "Solosuchiapa", "Soyaló", "Suchiapa", "Suchiate", "Sunuapa", "Tapachula", "Tapalapa", "Tapilula", "Tecpatán", "Tenejapa", "Teopisca", "Tila", "Tonalá", "Totolapa", "Tumbalá", "Tuxtla Chico", "Tuxtla Gutiérrez", "Tuzantán", "Tzimol", "Unión Juárez", "Venustiano Carranza", "Villa Comaltitlán", "Villa Corzo", "Villaflores", "Yajalón", "Zinacantán", "Ángel Albino Corzo"], "Chihuahua": ["Ahumada", "Aldama", "Allende", "Aquiles Serdán", "Ascensión", "Bachíniva", "Balleza", "Batopilas de Manuel Gómez Morín", "Bocoyna", "Buenaventura", "Camargo", "Carichí", "Casas Grandes", "Chihuahua", "Chínipas", "Coronado", "Coyame del Sotol", "Cuauhtémoc", "Cusihuiriachi", "Delicias", "Dr. Belisario Domínguez", "El Tule", "Galeana", "Gran Morelos", "Guachochi", "Guadalupe", "Guadalupe y Calvo", "Guazapares", "Guerrero", "Gómez Farías", "Hidalgo del Parral", "Huejotitán", "Ignacio Zaragoza", "Janos", "Jiménez", "Julimes", "Juárez", "La Cruz", "López", "Madera", "Maguarichi", "Manuel Benavides", "Matachí", "Matamoros", "Meoqui", "Morelos", "Moris", "Namiquipa", "Nonoava", "Nuevo Casas Grandes", "Ocampo", "Ojinaga", "Praxedis G. Guerrero", "Riva Palacio", "Rosales", "San Francisco de Borja", "San Francisco de Conchos", "San Francisco del Oro", "Santa Bárbara", "Santa Isabel", "Satevó", "Saucillo", "Temósachic", "Urique", "Uruachi", "Valle de Zaragoza", "Valle del Rosario"], "Ciudad de México": ["Azcapotzalco", "Benito Juárez", "Coyoacán", "Cuajimalpa de Morelos", "Cuauhtémoc", "Gustavo A. Madero", "Iztacalco", "Iztapalapa", "La Magdalena Contreras", "Miguel Hidalgo", "Milpa Alta", "Tlalpan", "Tláhuac", "Venustiano Carranza", "Xochimilco", "Álvaro Obregón"], "Coahuila de Zaragoza": ["Abasolo", "Acuña", "Allende", "Arteaga", "Candela", "Castaños", "Cuatro Ciénegas", "Escobedo", "Francisco I. Madero", "Frontera", "General Cepeda", "Guerrero", "Hidalgo", "Jiménez", "Juárez", "Lamadrid", "Matamoros", "Monclova", "Morelos", "Múzquiz", "Nadadores", "Nava", "Ocampo", "Parras", "Piedras Negras", "Progreso", "Ramos Arizpe", "Sabinas", "Sacramento", "Saltillo", "San Buenaventura", "San Juan de Sabinas", "San Pedro", "Sierra Mojada", "Torreón", "Viesca", "Villa Unión", "Zaragoza"], "Colima": ["Armería", "Colima", "Comala", "Coquimatlán", "Cuauhtémoc", "Ixtlahuacán", "Manzanillo", "Minatitlán", "Tecomán", "Villa de Álvarez"], "Durango": ["Canatlán", "Canelas", "Coneto de Comonfort", "Cuencamé", "Durango", "El Oro", "General Simón Bolívar", "Guadalupe Victoria", "Guanaceví", "Gómez Palacio", "Hidalgo", "Indé", "Lerdo", "Mapimí", "Mezquital", "Nazas", "Nombre de Dios", "Nuevo Ideal", "Ocampo", "Otáez", "Peñón Blanco", "Poanas", "Pueblo Nuevo", "Pánuco de Coronado", "Rodeo", "San Bernardo", "San Dimas", "San Juan de Guadalupe", "San Juan del Río", "San Luis del Cordero", "San Pedro del Gallo", "Santa Clara", "Santiago Papasquiaro", "Súchil", "Tamazula", "Tepehuanes", "Tlahualilo", "Topia", "Vicente Guerrero"], "Guanajuato": ["Abasolo", "Acámbaro", "Apaseo el Alto", "Apaseo el Grande", "Atarjea", "Celaya", "Comonfort", "Coroneo", "Cortazar", "Cuerámaro", "Doctor Mora", "Dolores Hidalgo Cuna de la Independencia Nacional", "Guanajuato", "Huanímaro", "Irapuato", "Jaral del Progreso", "Jerécuaro", "León", "Manuel Doblado", "Moroleón", "Ocampo", "Pueblo Nuevo", "Purísima del Rincón", "Pénjamo", "Romita", "Salamanca", "Salvatierra", "San Diego de la Unión", "San Felipe", "San Francisco del Rincón", "San José de Iturbide", "San Luis de la Paz", "San Miguel de Allende", "Santa Catarina", "Santa Cruz de Juventino Rosas", "Santiago Maravatío", "Silao de la Victoria", "Tarandacuao", "Tarimoro", "Tierra Blanca", "Uriangato", "Valle de Santiago", "Victoria", "Villagrán", "Xichú", "Yuriria"], "Guerrero": ["Acapulco de Juárez", "Acatepec", "Ahuacuotzingo", "Ajuchitlán del Progreso", "Alcozauca de Guerrero", "Alpoyeca", "Apaxtla de Castrejón", "Arcelia", "Atenango del Río", "Atlamajalcingo del Monte", "Atlixtac", "Atoyac de Álvarez", "Ayutla de los Libres", "Azoyú", "Benito Juárez", "Buenavista de Cuéllar", "Chilapa de Álvarez", "Chilpancingo de los Bravo", "Coahuayutla de José María Izazaga", "Cochoapa el Grande", "Cocula", "Copala", "Copalillo", "Copanatoyac", "Coyuca de Benítez", "Coyuca de Catalán", "Cuajinicuilapa", "Cualác", "Cuautepec", "Cuetzala del Progreso", "Cutzamala de Pinzón", "Eduardo Neri", "Florencio Villarreal", "General Canuto A. Neri", "General Heliodoro Castillo", "Huamuxtitlán", "Huitzuco de los Figueroa", "Iguala de la Independencia", "Igualapa", "Iliatenco", "Ixcateopan de Cuauhtémoc", "José Joaquín de Herrera", "Juan R. Escudero", "Juchitán", "La Unión de Isidoro Montes de Oca", "Las Vigas", "Leonardo Bravo", "Malinaltepec", "Marquelia", "Metlatónoc", "Mochitlán", "Mártir de Cuilapan", "Olinalá", "Ometepec", "Pedro Ascencio Alquisiras", "Petatlán", "Pilcaya", "Pungarabato", "Quechultenango", "San Luis Acatlán", "San Marcos", "San Miguel Totolapan", "San Nicolás", "Santa Cruz del Rincón", "Taxco de Alarcón", "Tecoanapa", "Teloloapan", "Tepecoacuilco de Trujano", "Tetipac", "Tixtla de Guerrero", "Tlacoachistlahuaca", "Tlacoapa", "Tlalchapa", "Tlalixtaquilla de Maldonado", "Tlapa de Comonfort", "Tlapehuala", "Técpan de Galeana", "Xalpatláhuac", "Xochihuehuetlán", "Xochistlahuaca", "Zapotitlán Tablas", "Zihuatanejo de Azueta", "Zirándaro", "Zitlala", "Ñuu Savi"], "Hidalgo": ["Acatlán", "Acaxochitlán", "Actopan", "Agua Blanca de Iturbide", "Ajacuba", "Alfajayucan", "Almoloya", "Apan", "Atitalaquia", "Atlapexco", "Atotonilco de Tula", "Atotonilco el Grande", "Calnali", "Cardonal", "Chapantongo", "Chapulhuacán", "Chilcuautla", "Cuautepec de Hinojosa", "El Arenal", "Eloxochitlán", "Emiliano Zapata", "Epazoyucan", "Francisco I. Madero", "Huasca de Ocampo", "Huautla", "Huazalingo", "Huehuetla", "Huejutla de Reyes", "Huichapan", "Ixmiquilpan", "Jacala de Ledezma", "Jaltocán", "Juárez Hidalgo", "La Misión", "Lolotla", "Metepec", "Metztitlán", "Mineral de la Reforma", "Mineral del Chico", "Mineral del Monte", "Mixquiahuala de Juárez", "Molango de Escamilla", "Nicolás Flores", "Nopala de Villagrán", "Omitlán de Juárez", "Pachuca de Soto", "Pacula", "Pisaflores", "Progreso de Obregón", "San Agustín Metzquititlán", "San Agustín Tlaxiaca", "San Bartolo Tutotepec", "San Felipe Orizatlán", "San Salvador", "Santiago Tulantepec de Lugo Guerrero", "Santiago de Anaya", "Singuilucan", "Tasquillo", "Tecozautla", "Tenango de Doria", "Tepeapulco", "Tepehuacán de Guerrero", "Tepeji del Río de Ocampo", "Tepetitlán", "Tetepango", "Tezontepec de Aldama", "Tianguistengo", "Tizayuca", "Tlahuelilpan", "Tlahuiltepa", "Tlanalapa", "Tlanchinol", "Tlaxcoapan", "Tolcayuca", "Tula de Allende", "Tulancingo de Bravo", "Villa de Tezontepec", "Xochiatipan", "Xochicoatlán", "Yahualica", "Zacualtipán de Ángeles", "Zapotlán de Juárez", "Zempoala", "Zimapán"], "Jalisco": ["Acatic", "Acatlán de Juárez", "Ahualulco de Mercado", "Amacueca", "Amatitán", "Ameca", "Arandas", "Atemajac de Brizuela", "Atengo", "Atenguillo", "Atotonilco el Alto", "Atoyac", "Autlán de Navarro", "Ayotlán", "Ayutla", "Bolaños", "Cabo Corrientes", "Casimiro Castillo", "Cañadas de Obregón", "Chapala", "Chimaltitán", "Chiquilistlán", "Cihuatlán", "Cocula", "Colotlán", "Concepción de Buenos Aires", "Cuautitlán de García Barragán", "Cuautla", "Cuquío", "Degollado", "Ejutla", "El Arenal", "El Grullo", "El Limón", "El Salto", "Encarnación de Díaz", "Etzatlán", "Guachinango", "Guadalajara", "Gómez Farías", "Hostotipaquillo", "Huejuquilla el Alto", "Huejúcar", "Ixtlahuacán de los Membrillos", "Ixtlahuacán del Río", "Jalostotitlán", "Jamay", "Jesús María", "Jilotlán de los Dolores", "Jocotepec", "Juanacatlán", "Juchitlán", "La Barca", "La Huerta", "La Manzanilla de la Paz", "Lagos de Moreno", "Magdalena", "Mascota", "Mazamitla", "Mexticacán", "Mezquitic", "Mixtlán", "Ocotlán", "Ojuelos de Jalisco", "Pihuamo", "Poncitlán", "Puerto Vallarta", "Quitupan", "San Cristóbal de la Barranca", "San Diego de Alejandría", "San Gabriel", "San Ignacio Cerro Gordo", "San Juan de los Lagos", "San Juanito de Escobedo", "San Julián", "San Marcos", "San Martín Hidalgo", "San Martín de Bolaños", "San Miguel el Alto", "San Pedro Tlaquepaque", "San Sebastián del Oeste", "Santa María de los Ángeles", "Santa María del Oro", "Sayula", "Tala", "Talpa de Allende", "Tamazula de Gordiano", "Tapalpa", "Tecalitlán", "Techaluta de Montenegro", "Tecolotlán", "Tenamaxtlán", "Teocaltiche", "Teocuitatlán de Corona", "Tepatitlán de Morelos", "Tequila", "Teuchitlán", "Tizapán el Alto", "Tlajomulco de Zúñiga", "Tolimán", "Tomatlán", "Tonalá", "Tonaya", "Tonila", "Totatiche", "Tototlán", "Tuxcacuesco", "Tuxcueca", "Tuxpan", "Unión de San Antonio", "Unión de Tula", "Valle de Guadalupe", "Valle de Juárez", "Villa Corona", "Villa Guerrero", "Villa Hidalgo", "Villa Purificación", "Yahualica de González Gallo", "Zacoalco de Torres", "Zapopan", "Zapotiltic", "Zapotitlán de Vadillo", "Zapotlanejo", "Zapotlán del Rey", "Zapotlán el Grande"], "Michoacán de Ocampo": ["Acuitzio", "Aguililla", "Angamacutiro", "Angangueo", "Apatzingán", "Aporo", "Aquila", "Ario", "Arteaga", "Briseñas", "Buenavista", "Carácuaro", "Charapan", "Charo", "Chavinda", "Cherán", "Chilchota", "Chinicuila", "Chucándiro", "Churintzio", "Churumuco", "Coahuayana", "Coalcomán de Vázquez Pallares", "Coeneo", "Cojumatlán de Régules", "Contepec", "Copándaro", "Cotija", "Cuitzeo", "Ecuandureo", "Epitacio Huerta", "Erongarícuaro", "Gabriel Zamora", "Hidalgo", "Huandacareo", "Huaniqueo", "Huetamo", "Huiramba", "Indaparapeo", "Irimbo", "Ixtlán", "Jacona", "Jiménez", "Jiquilpan", "José Sixto Verduzco", "Jungapeo", "Juárez", "La Huacana", "La Piedad", "Lagunillas", "Los Reyes", "Lázaro Cárdenas", "Madero", "Maravatío", "Marcos Castellanos", "Morelia", "Morelos", "Múgica", "Nahuatzen", "Nocupétaro", "Nuevo Parangaricutiro", "Nuevo Urecho", "Numarán", "Ocampo", "Pajacuarán", "Panindícuaro", "Paracho", "Parácuaro", "Penjamillo", "Peribán", "Puruándiro", "Purépero", "Pátzcuaro", "Queréndaro", "Quiroga", "Sahuayo", "Salvador Escalante", "San Lucas", "Santa Ana Maya", "Senguio", "Susupuato", "Tacámbaro", "Tancítaro", "Tangamandapio", "Tangancícuaro", "Tanhuato", "Taretan", "Tarímbaro", "Tepalcatepec", "Tingambato", "Tingüindín", "Tiquicheo de Nicolás Romero", "Tlalpujahua", "Tlazazalca", "Tocumbo", "Tumbiscatío", "Turicato", "Tuxpan", "Tuzantla", "Tzintzuntzan", "Tzitzio", "Uruapan", "Venustiano Carranza", "Villamar", "Vista Hermosa", "Yurécuaro", "Zacapu", "Zamora", "Zinapécuaro", "Zináparo", "Ziracuaretiro", "Zitácuaro", "Álvaro Obregón"], "Morelos": ["Amacuzac", "Atlatlahucan", "Axochiapan", "Ayala", "Coatetelco", "Coatlán del Río", "Cuautla", "Cuernavaca", "Emiliano Zapata", "Hueyapan", "Huitzilac", "Jantetelco", "Jiutepec", "Jojutla", "Jonacatepec de Leandro Valle", "Mazatepec", "Miacatlán", "Ocuituco", "Puente de Ixtla", "Temixco", "Temoac", "Tepalcingo", "Tepoztlán", "Tetecala", "Tetela del Volcán", "Tlalnepantla", "Tlaltizapán de Zapata", "Tlaquiltenango", "Tlayacapan", "Totolapan", "Xochitepec", "Xoxocotla", "Yautepec", "Yecapixtla", "Zacatepec", "Zacualpan de Amilpas"], "México": ["Acambay de Ruíz Castañeda", "Acolman", "Aculco", "Almoloya de Alquisiras", "Almoloya de Juárez", "Almoloya del Río", "Amanalco", "Amatepec", "Amecameca", "Apaxco", "Atenco", "Atizapán", "Atizapán de Zaragoza", "Atlacomulco", "Atlautla", "Axapusco", "Ayapango", "Calimaya", "Capulhuac", "Chalco", "Chapa de Mota", "Chapultepec", "Chiautla", "Chicoloapan", "Chiconcuac", "Chimalhuacán", "Coacalco de Berriozábal", "Coatepec Harinas", "Cocotitlán", "Coyotepec", "Cuautitlán", "Cuautitlán Izcalli", "Donato Guerra", "Ecatepec de Morelos", "Ecatzingo", "El Oro", "Huehuetoca", "Hueypoxtla", "Huixquilucan", "Isidro Fabela", "Ixtapaluca", "Ixtapan de la Sal", "Ixtapan del Oro", "Ixtlahuaca", "Jaltenco", "Jilotepec", "Jilotzingo", "Jiquipilco", "Jocotitlán", "Joquicingo", "Juchitepec", "La Paz", "Lerma", "Luvianos", "Malinalco", "Melchor Ocampo", "Metepec", "Mexicaltzingo", "Morelos", "Naucalpan de Juárez", "Nextlalpan", "Nezahualcóyotl", "Nicolás Romero", "Nopaltepec", "Ocoyoacac", "Ocuilan", "Otumba", "Otzoloapan", "Otzolotepec", "Ozumba", "Papalotla", "Polotitlán", "Rayón", "San Antonio la Isla", "San Felipe del Progreso", "San José del Rincón", "San Martín de las Pirámides", "San Mateo Atenco", "San Simón de Guerrero", "Santo Tomás", "Soyaniquilpan de Juárez", "Sultepec", "Tecámac", "Tejupilco", "Temamatla", "Temascalapa", "Temascalcingo", "Temascaltepec", "Temoaya", "Tenancingo", "Tenango del Aire", "Tenango del Valle", "Teoloyucan", "Teotihuacán", "Tepetlaoxtoc", "Tepetlixpa", "Tepotzotlán", "Tequixquiac", "Texcaltitlán", "Texcalyacac", "Texcoco", "Tezoyuca", "Tianguistenco", "Timilpan", "Tlalmanalco", "Tlalnepantla de Baz", "Tlatlaya", "Toluca", "Tonanitla", "Tonatico", "Tultepec", "Tultitlán", "Valle de Bravo", "Valle de Chalco Solidaridad", "Villa Guerrero", "Villa Victoria", "Villa de Allende", "Villa del Carbón", "Xalatlaco", "Xonacatlán", "Zacazonapan", "Zacualpan", "Zinacantepec", "Zumpahuacán", "Zumpango"], "Nayarit": ["Acaponeta", "Ahuacatlán", "Amatlán de Cañas", "Bahía de Banderas", "Compostela", "Del Nayar", "Huajicori", "Ixtlán del Río", "Jala", "La Yesca", "Rosamorada", "Ruíz", "San Blas", "San Pedro Lagunillas", "Santa María del Oro", "Santiago Ixcuintla", "Tecuala", "Tepic", "Tuxpan", "Xalisco"], "Nuevo León": ["Abasolo", "Agualeguas", "Allende", "Anáhuac", "Apodaca", "Aramberri", "Bustamante", "Cadereyta Jiménez", "Cerralvo", "China", "Ciénega de Flores", "Doctor Arroyo", "Doctor Coss", "Doctor González", "El Carmen", "Galeana", "García", "General Bravo", "General Escobedo", "General Terán", "General Treviño", "General Zaragoza", "General Zuazua", "Guadalupe", "Hidalgo", "Higueras", "Hualahuises", "Iturbide", "Juárez", "Lampazos de Naranjo", "Linares", "Los Aldamas", "Los Herreras", "Los Ramones", "Marín", "Melchor Ocampo", "Mier y Noriega", "Mina", "Montemorelos", "Monterrey", "Parás", "Pesquería", "Rayones", "Sabinas Hidalgo", "Salinas Victoria", "San Nicolás de los Garza", "San Pedro Garza García", "Santa Catarina", "Santiago", "Vallecillo", "Villaldama"], "Oaxaca": ["Abejones", "Acatlán de Pérez Figueroa", "Asunción Cacalotepec", "Asunción Cuyotepeji", "Asunción Ixtaltepec", "Asunción Nochixtlán", "Asunción Ocotlán", "Asunción Tlacolulita", "Ayoquezco de Aldama", "Ayotzintepec", "Calihualá", "Candelaria Loxicha", "Capulálpam de Méndez", "Chahuites", "Chalcatongo de Hidalgo", "Chiquihuitlán de Benito Juárez", "Ciudad Ixtepec", "Ciénega de Zimatlán", "Coatecas Altas", "Coicoyán de las Flores", "Concepción Buenavista", "Concepción Pápalo", "Constancia del Rosario", "Cosolapa", "Cosoltepec", "Cuilápam de Guerrero", "Cuyamecalco Villa de Zaragoza", "El Barrio de la Soledad", "El Espinal", "Eloxochitlán de Flores Magón", "Fresnillo de Trujano", "Guadalupe Etla", "Guadalupe de Ramírez", "Guelatao de Juárez", "Guevea de Humboldt", "Heroica Ciudad de Ejutla de Crespo", "Heroica Ciudad de Huajuapan de León", "Heroica Ciudad de Juchitán de Zaragoza", "Heroica Ciudad de Miahuatlán de Porfirio Díaz", "Heroica Ciudad de Tlaxiaco", "Heroica Villa Tezoatlán de Segura y Luna, Cuna de la Independencia de Oaxaca", "Heroica Villa de San Blas Atempa", "Heroico San Martín de los Cansecos", "Huautepec", "Huautla de Jiménez", "Ixpantepec Nieves", "Ixtlán de Juárez", "La Compañía", "La Pe", "La Reforma", "La Trinidad Vista Hermosa", "Loma Bonita", "Magdalena Apasco", "Magdalena Jaltepec", "Magdalena Mixtepec", "Magdalena Ocotlán", "Magdalena Peñasco", "Magdalena Teitipac", "Magdalena Tequisistlán", "Magdalena Tlacotepec", "Magdalena Yodocono de Porfirio Díaz", "Magdalena Zahuatlán", "Mariscala de Juárez", "Matías Romero Avendaño", "Mazatlán Villa de Flores", "Mesones Hidalgo", "Mixistlán de la Reforma", "Monjas", "Mártires de Tacubaya", "Natividad", "Nazareno Etla", "Nejapa de Madero", "Nuevo Zoquiápam", "Oaxaca de Juárez", "Ocotlán de Morelos", "Pinotepa de Don Luis", "Pluma Hidalgo", "Putla Villa de Guerrero", "Reforma de Pineda", "Reyes Etla", "Rojas de Cuauhtémoc", "Salina Cruz", "San Agustín Amatengo", "San Agustín Atenango", "San Agustín Chayuco", "San Agustín Etla", "San Agustín Loxicha", "San Agustín Tlacotepec", "San Agustín Yatareni", "San Agustín de las Juntas", "San Andrés Cabecera Nueva", "San Andrés Dinicuiti", "San Andrés Huaxpaltepec", "San Andrés Huayápam", "San Andrés Ixtlahuaca", "San Andrés Lagunas", "San Andrés Nuxiño", "San Andrés Paxtlán", "San Andrés Sinaxtla", "San Andrés Solaga", "San Andrés Teotilálpam", "San Andrés Tepetlapa", "San Andrés Yaá", "San Andrés Zabache", "San Andrés Zautla", "San Antonino Castillo Velasco", "San Antonino Monte Verde", "San Antonino el Alto", "San Antonio Acutla", "San Antonio Huitepec", "San Antonio Nanahuatípam", "San Antonio Sinicahua", "San Antonio Tepetlapa", "San Antonio de la Cal", "San Baltazar Chichicápam", "San Baltazar Loxicha", "San Baltazar Yatzachi el Bajo", "San Bartolo Coyotepec", "San Bartolo Soyaltepec", "San Bartolo Yautepec", "San Bartolomé Ayautla", "San Bartolomé Loxicha", "San Bartolomé Quialana", "San Bartolomé Yucuañe", "San Bartolomé Zoogocho", "San Bernardo Mixtepec", "San Carlos Yautepec", "San Cristóbal Amatlán", "San Cristóbal Amoltepec", "San Cristóbal Lachirioag", "San Cristóbal Suchixtlahuaca", "San Dionisio Ocotepec", "San Dionisio Ocotlán", "San Dionisio del Mar", "San Esteban Atatlahuca", "San Felipe Jalapa de Díaz", "San Felipe Tejalápam", "San Felipe Usila", "San Francisco Cahuacuá", "San Francisco Cajonos", "San Francisco Chapulapa", "San Francisco Chindúa", "San Francisco Huehuetlán", "San Francisco Ixhuatán", "San Francisco Jaltepetongo", "San Francisco Lachigoló", "San Francisco Logueche", "San Francisco Nuxaño", "San Francisco Ozolotepec", "San Francisco Sola", "San Francisco Telixtlahuaca", "San Francisco Teopan", "San Francisco Tlapancingo", "San Francisco del Mar", "San Gabriel Mixtepec", "San Ildefonso Amatlán", "San Ildefonso Sola", "San Ildefonso Villa Alta", "San Jacinto Amilpas", "San Jacinto Tlacotepec", "San Jerónimo Coatlán", "San Jerónimo Silacayoapilla", "San Jerónimo Sosola", "San Jerónimo Taviche", "San Jerónimo Tecóatl", "San Jerónimo Tlacochahuaya", "San Jorge Nuchita", "San José Ayuquila", "San José Chiltepec", "San José Estancia Grande", "San José Independencia", "San José Lachiguiri", "San José Tenango", "San José del Peñasco", "San José del Progreso", "San Juan Achiutla", "San Juan Atepec", "San Juan Bautista Atatlahuca", "San Juan Bautista Coixtlahuaca", "San Juan Bautista Cuicatlán", "San Juan Bautista Guelache", "San Juan Bautista Jayacatlán", "San Juan Bautista Lo de Soto", "San Juan Bautista Suchitepec", "San Juan Bautista Tlachichilco", "San Juan Bautista Tlacoatzintepec", "San Juan Bautista Tuxtepec", "San Juan Bautista Valle Nacional", "San Juan Cacahuatepec", "San Juan Chicomezúchil", "San Juan Chilateca", "San Juan Cieneguilla", "San Juan Coatzóspam", "San Juan Colorado", "San Juan Comaltepec", "San Juan Cotzocón", "San Juan Diuxi", "San Juan Evangelista Analco", "San Juan Guelavía", "San Juan Guichicovi", "San Juan Ihualtepec", "San Juan Juquila Mixes", "San Juan Juquila Vijanos", "San Juan Lachao", "San Juan Lachigalla", "San Juan Lajarcia", "San Juan Lalana", "San Juan Mazatlán", "San Juan Mixtepec", "San Juan Mixtepec", "San Juan Ozolotepec", "San Juan Petlapa", "San Juan Quiahije", "San Juan Quiotepec", "San Juan Sayultepec", "San Juan Tabaá", "San Juan Tamazola", "San Juan Teita", "San Juan Teitipac", "San Juan Tepeuxila", "San Juan Teposcolula", "San Juan Yaeé", "San Juan Yatzona", "San Juan Yucuita", "San Juan de los Cués", "San Juan del Estado", "San Juan del Río", "San Juan Ñumí", "San Lorenzo", "San Lorenzo Albarradas", "San Lorenzo Cacaotepec", "San Lorenzo Cuaunecuiltitla", "San Lorenzo Texmelúcan", "San Lorenzo Victoria", "San Lucas Camotlán", "San Lucas Ojitlán", "San Lucas Quiaviní", "San Lucas Zoquiápam", "San Luis Amatlán", "San Marcial Ozolotepec", "San Marcos Arteaga", "San Martín Huamelúlpam", "San Martín Itunyoso", "San Martín Lachilá", "San Martín Peras", "San Martín Tilcajete", "San Martín Toxpalan", "San Martín Zacatepec", "San Mateo Cajonos", "San Mateo Etlatongo", "San Mateo Nejápam", "San Mateo Peñasco", "San Mateo Piñas", "San Mateo Río Hondo", "San Mateo Sindihui", "San Mateo Tlapiltepec", "San Mateo Yoloxochitlán", "San Mateo Yucutindoo", "San Mateo del Mar", "San Melchor Betaza", "San Miguel Achiutla", "San Miguel Ahuehuetitlán", "San Miguel Aloápam", "San Miguel Amatitlán", "San Miguel Amatlán", "San Miguel Chicahua", "San Miguel Chimalapa", "San Miguel Coatlán", "San Miguel Ejutla", "San Miguel Huautla", "San Miguel Mixtepec", "San Miguel Panixtlahuaca", "San Miguel Peras", "San Miguel Piedras", "San Miguel Quetzaltepec", "San Miguel Santa Flor", "San Miguel Soyaltepec", "San Miguel Suchixtepec", "San Miguel Tecomatlán", "San Miguel Tenango", "San Miguel Tequixtepec", "San Miguel Tilquiápam", "San Miguel Tlacamama", "San Miguel Tlacotepec", "San Miguel Tulancingo", "San Miguel Yotao", "San Miguel del Puerto", "San Miguel del Río", "San Miguel el Grande", "San Nicolás", "San Nicolás Hidalgo", "San Pablo Coatlán", "San Pablo Cuatro Venados", "San Pablo Etla", "San Pablo Huitzo", "San Pablo Huixtepec", "San Pablo Macuiltianguis", "San Pablo Tijaltepec", "San Pablo Villa de Mitla", "San Pablo Yaganiza", "San Pedro Amuzgos", "San Pedro Apóstol", "San Pedro Atoyac", "San Pedro Cajonos", "San Pedro Comitancillo", "San Pedro Coxcaltepec Cántaros", "San Pedro Huamelula", "San Pedro Huilotepec", "San Pedro Ixcatlán", "San Pedro Ixtlahuaca", "San Pedro Jaltepetongo", "San Pedro Jicayán", "San Pedro Jocotipac", "San Pedro Juchatengo", "San Pedro Mixtepec", "San Pedro Mixtepec", "San Pedro Molinos", "San Pedro Mártir", "San Pedro Mártir Quiechapa", "San Pedro Mártir Yucuxaco", "San Pedro Nopala", "San Pedro Ocopetatillo", "San Pedro Ocotepec", "San Pedro Pochutla", "San Pedro Quiatoni", "San Pedro Sochiápam", "San Pedro Tapanatepec", "San Pedro Taviche", "San Pedro Teozacoalco", "San Pedro Teutila", "San Pedro Tidaá", "San Pedro Topiltepec", "San Pedro Totolápam", "San Pedro Yaneri", "San Pedro Yucunama", "San Pedro Yólox", "San Pedro el Alto", "San Pedro y San Pablo Ayutla", "San Pedro y San Pablo Teposcolula", "San Pedro y San Pablo Tequixtepec", "San Raymundo Jalpan", "San Sebastián Abasolo", "San Sebastián Coatlán", "San Sebastián Ixcapa", "San Sebastián Nicananduta", "San Sebastián Río Hondo", "San Sebastián Tecomaxtlahuaca", "San Sebastián Teitipac", "San Sebastián Tutla", "San Simón Almolongas", "San Simón Zahuatlán", "San Vicente Coatlán", "San Vicente Lachixío", "San Vicente Nuñú", "Santa Ana", "Santa Ana Ateixtlahuaca", "Santa Ana Cuauhtémoc", "Santa Ana Tavela", "Santa Ana Tlapacoyan", "Santa Ana Yareni", "Santa Ana Zegache", "Santa Ana del Valle", "Santa Catalina Quierí", "Santa Catarina Cuixtla", "Santa Catarina Ixtepeji", "Santa Catarina Juquila", "Santa Catarina Lachatao", "Santa Catarina Loxicha", "Santa Catarina Mechoacán", "Santa Catarina Minas", "Santa Catarina Quiané", "Santa Catarina Quioquitani", "Santa Catarina Tayata", "Santa Catarina Ticuá", "Santa Catarina Yosonotú", "Santa Catarina Zapoquila", "Santa Cruz Acatepec", "Santa Cruz Amilpas", "Santa Cruz Itundujia", "Santa Cruz Mixtepec", "Santa Cruz Nundaco", "Santa Cruz Papalutla", "Santa Cruz Tacache de Mina", "Santa Cruz Tacahua", "Santa Cruz Tayata", "Santa Cruz Xitla", "Santa Cruz Xoxocotlán", "Santa Cruz Zenzontepec", "Santa Cruz de Bravo", "Santa Gertrudis", "Santa Inés Yatzeche", "Santa Inés de Zaragoza", "Santa Inés del Monte", "Santa Lucía Miahuatlán", "Santa Lucía Monteverde", "Santa Lucía Ocotlán", "Santa Lucía del Camino", "Santa Magdalena Jicotlán", "Santa María Alotepec", "Santa María Apazco", "Santa María Atzompa", "Santa María Camotlán", "Santa María Chachoápam", "Santa María Chilchotla", "Santa María Chimalapa", "Santa María Colotepec", "Santa María Cortijo", "Santa María Coyotepec", "Santa María Ecatepec", "Santa María Guelacé", "Santa María Guienagati", "Santa María Huatulco", "Santa María Huazolotitlán", "Santa María Ipalapa", "Santa María Ixcatlán", "Santa María Jacatepec", "Santa María Jalapa del Marqués", "Santa María Jaltianguis", "Santa María Lachixío", "Santa María Mixtequilla", "Santa María Nativitas", "Santa María Nduayaco", "Santa María Ozolotepec", "Santa María Petapa", "Santa María Peñoles", "Santa María Pápalo", "Santa María Quiegolani", "Santa María Sola", "Santa María Tataltepec", "Santa María Tecomavaca", "Santa María Temaxcalapa", "Santa María Temaxcaltepec", "Santa María Teopoxco", "Santa María Tepantlali", "Santa María Texcatitlán", "Santa María Tlahuitoltepec", "Santa María Tlalixtac", "Santa María Tonameca", "Santa María Totolapilla", "Santa María Xadani", "Santa María Yalina", "Santa María Yavesía", "Santa María Yolotepec", "Santa María Yosoyúa", "Santa María Yucuhiti", "Santa María Zacatepec", "Santa María Zaniza", "Santa María Zoquitlán", "Santa María del Rosario", "Santa María del Tule", "Santa María la Asunción", "Santiago Amoltepec", "Santiago Apoala", "Santiago Apóstol", "Santiago Astata", "Santiago Atitlán", "Santiago Ayuquililla", "Santiago Cacaloxtepec", "Santiago Camotlán", "Santiago Choápam", "Santiago Comaltepec", "Santiago Huajolotitlán", "Santiago Huauclilla", "Santiago Ihuitlán Plumas", "Santiago Ixcuintepec", "Santiago Ixtayutla", "Santiago Jamiltepec", "Santiago Jocotepec", "Santiago Juxtlahuaca", "Santiago Lachiguiri", "Santiago Lalopa", "Santiago Laollaga", "Santiago Laxopa", "Santiago Llano Grande", "Santiago Matatlán", "Santiago Miltepec", "Santiago Minas", "Santiago Nacaltepec", "Santiago Nejapilla", "Santiago Niltepec", "Santiago Nundiche", "Santiago Nuyoó", "Santiago Pinotepa Nacional", "Santiago Suchilquitongo", "Santiago Tamazola", "Santiago Tapextla", "Santiago Tenango", "Santiago Tepetlapa", "Santiago Tetepec", "Santiago Texcalcingo", "Santiago Textitlán", "Santiago Tilantongo", "Santiago Tillo", "Santiago Tlazoyaltepec", "Santiago Xanica", "Santiago Xiacuí", "Santiago Yaitepec", "Santiago Yaveo", "Santiago Yolomécatl", "Santiago Yosondúa", "Santiago Yucuyachi", "Santiago Zacatepec", "Santiago Zoochila", "Santiago del Río", "Santo Domingo Albarradas", "Santo Domingo Armenta", "Santo Domingo Chihuitán", "Santo Domingo Ingenio", "Santo Domingo Ixcatlán", "Santo Domingo Nuxaá", "Santo Domingo Ozolotepec", "Santo Domingo Petapa", "Santo Domingo Roayaga", "Santo Domingo Tehuantepec", "Santo Domingo Teojomulco", "Santo Domingo Tepuxtepec", "Santo Domingo Tlatayápam", "Santo Domingo Tomaltepec", "Santo Domingo Tonaltepec", "Santo Domingo Tonalá", "Santo Domingo Xagacía", "Santo Domingo Yanhuitlán", "Santo Domingo Yodohino", "Santo Domingo Zanatepec", "Santo Domingo de Morelos", "Santo Tomás Jalieza", "Santo Tomás Mazaltepec", "Santo Tomás Ocotepec", "Santo Tomás Tamazulapan", "Santos Reyes Nopala", "Santos Reyes Pápalo", "Santos Reyes Tepejillo", "Santos Reyes Yucuná", "Silacayoápam", "Sitio de Xitlapehua", "Soledad Etla", "Tamazulápam del Espíritu Santo", "Tanetze de Zaragoza", "Taniche", "Tataltepec de Valdés", "Teococuilco de Marcos Pérez", "Teotitlán de Flores Magón", "Teotitlán del Valle", "Teotongo", "Tepelmeme Villa de Morelos", "Tlacolula de Matamoros", "Tlacotepec Plumas", "Tlalixtac de Cabrera", "Totontepec Villa de Morelos", "Trinidad Zaachila", "Unión Hidalgo", "Valerio Trujano", "Villa Díaz Ordaz", "Villa Hidalgo Yalálag", "Villa Sola de Vega", "Villa Talea de Castro", "Villa Tejúpam de la Unión", "Villa de Chilapa de Díaz", "Villa de Etla", "Villa de Santiago Chazumba", "Villa de Tamazulápam del Progreso", "Villa de Tututepec", "Villa de Zaachila", "Yaxe", "Yogana", "Yutanduchi de Guerrero", "Zapotitlán Lagunas", "Zapotitlán Palmas", "Zimatlán de Álvarez", "Ánimas Trujano"], "Puebla": ["Acajete", "Acateno", "Acatlán", "Acatzingo", "Acteopan", "Ahuacatlán", "Ahuatlán", "Ahuazotepec", "Ahuehuetitla", "Ajalpan", "Albino Zertuche", "Aljojuca", "Altepexi", "Amixtlán", "Amozoc", "Aquixtla", "Atempan", "Atexcal", "Atlequizayan", "Atlixco", "Atoyatempan", "Atzala", "Atzitzihuacán", "Atzitzintla", "Axutla", "Ayotoxco de Guerrero", "Calpan", "Caltepec", "Camocuautla", "Caxhuacan", "Cañada Morelos", "Chalchicomula de Sesma", "Chapulco", "Chiautla", "Chiautzingo", "Chichiquila", "Chiconcuautla", "Chietla", "Chigmecatitlán", "Chignahuapan", "Chignautla", "Chila", "Chila de la Sal", "Chilchotla", "Chinantla", "Coatepec", "Coatzingo", "Cohetzala", "Cohuecan", "Coronango", "Coxcatlán", "Coyomeapan", "Coyotepec", "Cuapiaxtla de Madero", "Cuautempan", "Cuautinchán", "Cuautlancingo", "Cuayuca de Andrade", "Cuetzalan del Progreso", "Cuyoaco", "Domingo Arenas", "Eloxochitlán", "Epatlán", "Esperanza", "Francisco Z. Mena", "General Felipe Ángeles", "Guadalupe", "Guadalupe Victoria", "Hermenegildo Galeana", "Honey", "Huaquechula", "Huatlatlauca", "Huauchinango", "Huehuetla", "Huehuetlán el Chico", "Huehuetlán el Grande", "Huejotzingo", "Hueyapan", "Hueytamalco", "Hueytlalpan", "Huitzilan de Serdán", "Huitziltepec", "Ixcamilpa de Guerrero", "Ixcaquixtla", "Ixtacamaxtitlán", "Ixtepec", "Izúcar de Matamoros", "Jalpan", "Jolalpan", "Jonotla", "Jopala", "Juan C. Bonilla", "Juan Galindo", "Juan N. Méndez", "La Magdalena Tlatlauquitepec", "Lafragua", "Libres", "Los Reyes de Juárez", "Mazapiltepec de Juárez", "Mixtla", "Molcaxac", "Naupan", "Nauzontla", "Nealtican", "Nicolás Bravo", "Nopalucan", "Ocotepec", "Ocoyucan", "Olintla", "Oriental", "Pahuatlán", "Palmar de Bravo", "Pantepec", "Petlalcingo", "Piaxtla", "Puebla", "Quecholac", "Quimixtlán", "Rafael Lara Grajales", "San Andrés Cholula", "San Antonio Cañada", "San Diego la Mesa Tochimiltzingo", "San Felipe Teotlalcingo", "San Felipe Tepatlán", "San Gabriel Chilac", "San Gregorio Atzompa", "San Jerónimo Tecuanipan", "San Jerónimo Xayacatlán", "San José Chiapa", "San José Miahuatlán", "San Juan Atenco", "San Juan Atzompa", "San Martín Texmelucan", "San Martín Totoltepec", "San Matías Tlalancaleca", "San Miguel Ixitlán", "San Miguel Xoxtla", "San Nicolás Buenos Aires", "San Nicolás de los Ranchos", "San Pablo Anicano", "San Pedro Cholula", "San Pedro Yeloixtlahuaca", "San Salvador Huixcolotla", "San Salvador el Seco", "San Salvador el Verde", "San Sebastián Tlacotepec", "Santa Catarina Tlaltempan", "Santa Inés Ahuatempan", "Santa Isabel Cholula", "Santiago Miahuatlán", "Santo Tomás Hueyotlipan", "Soltepec", "Tecali de Herrera", "Tecamachalco", "Tecomatlán", "Tehuacán", "Tehuitzingo", "Tenampulco", "Teopantlán", "Teotlalco", "Tepanco de López", "Tepango de Rodríguez", "Tepatlaxco de Hidalgo", "Tepeaca", "Tepemaxalco", "Tepeojuma", "Tepetzintla", "Tepexco", "Tepexi de Rodríguez", "Tepeyahualco", "Tepeyahualco de Cuauhtémoc", "Tetela de Ocampo", "Teteles de Ávila Castillo", "Teziutlán", "Tianguismanalco", "Tilapa", "Tlachichuca", "Tlacotepec de Benito Juárez", "Tlacuilotepec", "Tlahuapan", "Tlaltenango", "Tlanepantla", "Tlaola", "Tlapacoya", "Tlapanalá", "Tlatlauquitepec", "Tlaxco", "Tochimilco", "Tochtepec", "Totoltepec de Guerrero", "Tulcingo", "Tuzamapan de Galeana", "Tzicatlacoyan", "Venustiano Carranza", "Vicente Guerrero", "Xayacatlán de Bravo", "Xicotepec", "Xicotlán", "Xiutetelco", "Xochiapulco", "Xochiltepec", "Xochitlán Todos Santos", "Xochitlán de Vicente Suárez", "Yaonáhuac", "Yehualtepec", "Zacapala", "Zacapoaxtla", "Zacatlán", "Zapotitlán", "Zapotitlán de Méndez", "Zaragoza", "Zautla", "Zihuateutla", "Zinacatepec", "Zongozotla", "Zoquiapan", "Zoquitlán"], "Querétaro": ["Amealco de Bonfil", "Arroyo Seco", "Cadereyta de Montes", "Colón", "Corregidora", "El Marqués", "Ezequiel Montes", "Huimilpan", "Jalpan de Serra", "Landa de Matamoros", "Pedro Escobedo", "Peñamiller", "Pinal de Amoles", "Querétaro", "San Joaquín", "San Juan del Río", "Tequisquiapan", "Tolimán"], "Quintana Roo": ["Bacalar", "Benito Juárez", "Cozumel", "Felipe Carrillo Puerto", "Isla Mujeres", "José María Morelos", "Lázaro Cárdenas", "Othón P. Blanco", "Playa del Carmen", "Puerto Morelos", "Tulum"], "San Luis Potosí": ["Ahualulco del Sonido 13", "Alaquines", "Aquismón", "Armadillo de los Infante", "Axtla de Terrazas", "Catorce", "Cedral", "Cerritos", "Cerro de San Pedro", "Charcas", "Ciudad Fernández", "Ciudad Valles", "Ciudad del Maíz", "Coxcatlán", "Cárdenas", "Ebano", "El Naranjo", "Guadalcázar", "Huehuetlán", "Lagunillas", "Matehuala", "Matlapa", "Mexquitic de Carmona", "Moctezuma", "Rayón", "Rioverde", "Salinas", "San Antonio", "San Ciro de Acosta", "San Luis Potosí", "San Martín Chalchicuautla", "San Nicolás Tolentino", "San Vicente Tancuayalab", "Santa Catarina", "Santa María del Río", "Santo Domingo", "Soledad de Graciano Sánchez", "Tamasopo", "Tamazunchale", "Tampacán", "Tampamolón Corona", "Tamuín", "Tancanhuitz", "Tanlajás", "Tanquián de Escobedo", "Tierra Nueva", "Vanegas", "Venado", "Villa Hidalgo", "Villa Juárez", "Villa de Arista", "Villa de Arriaga", "Villa de Guadalupe", "Villa de Pozos", "Villa de Ramos", "Villa de Reyes", "Villa de la Paz", "Xilitla", "Zaragoza"], "Sinaloa": ["Ahome", "Angostura", "Badiraguato", "Choix", "Concordia", "Cosalá", "Culiacán", "El Fuerte", "Eldorado", "Elota", "Escuinapa", "Guasave", "Juan José Ríos", "Mazatlán", "Mocorito", "Navolato", "Rosario", "Salvador Alvarado", "San Ignacio", "Sinaloa"], "Sonora": ["Aconchi", "Agua Prieta", "Altar", "Arivechi", "Arizpe", "Atil", "Bacadéhuachi", "Bacanora", "Bacerac", "Bacoachi", "Banámichi", "Bavispe", "Baviácora", "Benito Juárez", "Benjamín Hill", "Bácum", "Caborca", "Cajeme", "Cananea", "Carbó", "Cucurpe", "Cumpas", "Divisaderos", "Empalme", "Etchojoa", "Fronteras", "General Plutarco Elías Calles", "Granados", "Guaymas", "Hermosillo", "Huachinera", "Huatabampo", "Huásabas", "Huépac", "Imuris", "La Colorada", "Magdalena", "Mazatán", "Moctezuma", "Naco", "Nacozari de García", "Navojoa", "Nogales", "Nácori Chico", "Opodepe", "Oquitoa", "Pitiquito", "Puerto Peñasco", "Quiriego", "Rayón", "Rosario", "Sahuaripa", "San Felipe de Jesús", "San Ignacio Río Muerto", "San Javier", "San Luis Río Colorado", "San Miguel de Horcasitas", "San Pedro de la Cueva", "Santa Ana", "Santa Cruz", "Soyopa", "Suaqui Grande", "Sáric", "Tepache", "Trincheras", "Tubutama", "Ures", "Villa Hidalgo", "Villa Pesqueira", "Yécora", "Álamos", "Ónavas"], "Tabasco": ["Balancán", "Centla", "Centro", "Comalcalco", "Cunduacán", "Cárdenas", "Emiliano Zapata", "Huimanguillo", "Jalapa", "Jalpa de Méndez", "Jonuta", "Macuspana", "Nacajuca", "Paraíso", "Tacotalpa", "Teapa", "Tenosique"], "Tamaulipas": ["Abasolo", "Aldama", "Altamira", "Antiguo Morelos", "Burgos", "Bustamante", "Camargo", "Casas", "Ciudad Madero", "Cruillas", "El Mante", "González", "Guerrero", "Gustavo Díaz Ordaz", "Gómez Farías", "Güémez", "Hidalgo", "Jaumave", "Jiménez", "Llera", "Mainero", "Matamoros", "Mier", "Miguel Alemán", "Miquihuana", "Méndez", "Nuevo Laredo", "Nuevo Morelos", "Ocampo", "Padilla", "Palmillas", "Reynosa", "Río Bravo", "San Carlos", "San Fernando", "San Nicolás", "Soto la Marina", "Tampico", "Tula", "Valle Hermoso", "Victoria", "Villagrán", "Xicoténcatl"], "Tlaxcala": ["Acuamanala de Miguel Hidalgo", "Amaxac de Guerrero", "Apetatitlán de Antonio Carvajal", "Apizaco", "Atlangatepec", "Atltzayanca", "Benito Juárez", "Calpulalpan", "Chiautempan", "Contla de Juan Cuamatzi", "Cuapiaxtla", "Cuaxomulco", "El Carmen Tequexquitla", "Emiliano Zapata", "Españita", "Huamantla", "Hueyotlipan", "Ixtacuixtla de Mariano Matamoros", "Ixtenco", "La Magdalena Tlaltelulco", "Lázaro Cárdenas", "Mazatecochco de José María Morelos", "Muñoz de Domingo Arenas", "Nanacamilpa de Mariano Arista", "Natívitas", "Panotla", "Papalotla de Xicohténcatl", "San Damián Texóloc", "San Francisco Tetlanohcan", "San Jerónimo Zacualpan", "San José Teacalco", "San Juan Huactzinco", "San Lorenzo Axocomanitla", "San Lucas Tecopilco", "San Pablo del Monte", "Sanctórum de Lázaro Cárdenas", "Santa Ana Nopalucan", "Santa Apolonia Teacalco", "Santa Catarina Ayometla", "Santa Cruz Quilehtla", "Santa Cruz Tlaxcala", "Santa Isabel Xiloxoxtla", "Tenancingo", "Teolocholco", "Tepetitla de Lardizábal", "Tepeyanco", "Terrenate", "Tetla de la Solidaridad", "Tetlatlahuca", "Tlaxcala", "Tlaxco", "Tocatlán", "Totolac", "Tzompantepec", "Xaloztoc", "Xaltocan", "Xicohtzinco", "Yauhquemehcan", "Zacatelco", "Ziltlaltépec de Trinidad Sánchez Santos"], "Veracruz de Ignacio de la Llave": ["Acajete", "Acatlán", "Acayucan", "Actopan", "Acula", "Acultzingo", "Agua Dulce", "Alpatláhuac", "Alto Lucero de Gutiérrez Barrios", "Altotonga", "Alvarado", "Amatitlán", "Amatlán de los Reyes", "Angel R. Cabada", "Apazapan", "Aquila", "Astacinga", "Atlahuilco", "Atoyac", "Atzacan", "Atzalan", "Ayahualulco", "Banderilla", "Benito Juárez", "Boca del Río", "Calcahualco", "Camarón de Tejeda", "Camerino Z. Mendoza", "Carlos A. Carrillo", "Carrillo Puerto", "Castillo de Teayo", "Catemaco", "Cazones de Herrera", "Cerro Azul", "Chacaltianguis", "Chalma", "Chiconamel", "Chiconquiaco", "Chicontepec", "Chinameca", "Chinampa de Gorostiza", "Chocamán", "Chontla", "Chumatlán", "Citlaltépetl", "Coacoatzintla", "Coahuitlán", "Coatepec", "Coatzacoalcos", "Coatzintla", "Coetzala", "Colipa", "Comapa", "Cosamaloapan de Carpio", "Cosautlán de Carvajal", "Coscomatepec", "Cosoleacaque", "Cotaxtla", "Coxquihui", "Coyutla", "Cuichapa", "Cuitláhuac", "Córdoba", "El Higo", "Emiliano Zapata", "Espinal", "Filomeno Mata", "Fortín", "Gutiérrez Zamora", "Hidalgotitlán", "Huatusco", "Huayacocotla", "Hueyapan de Ocampo", "Huiloapan de Cuauhtémoc", "Ignacio de la Llave", "Ilamatlán", "Isla", "Ixcatepec", "Ixhuacán de los Reyes", "Ixhuatlancillo", "Ixhuatlán de Madero", "Ixhuatlán del Café", "Ixhuatlán del Sureste", "Ixmatlahuacan", "Ixtaczoquitlán", "Jalacingo", "Jalcomulco", "Jamapa", "Jesús Carranza", "Jilotepec", "José Azueta", "Juan Rodríguez Clara", "Juchique de Ferrer", "Jáltipan", "La Antigua", "La Perla", "Landero y Coss", "Las Choapas", "Las Minas", "Las Vigas de Ramírez", "Lerdo de Tejada", "Los Reyes", "Magdalena", "Maltrata", "Manlio Fabio Altamirano", "Mariano Escobedo", "Martínez de la Torre", "Mecatlán", "Mecayapan", "Medellín de Bravo", "Miahuatlán", "Minatitlán", "Misantla", "Mixtla de Altamirano", "Moloacán", "Nanchital de Lázaro Cárdenas del Río", "Naolinco", "Naranjal", "Naranjos Amatlán", "Nautla", "Nogales", "Oluta", "Omealca", "Orizaba", "Otatitlán", "Oteapan", "Ozuluama de Mascareñas", "Pajapan", "Papantla", "Paso de Ovejas", "Paso del Macho", "Perote", "Platón Sánchez", "Playa Vicente", "Poza Rica de Hidalgo", "Pueblo Viejo", "Puente Nacional", "Pánuco", "Rafael Delgado", "Rafael Lucio", "Río Blanco", "Saltabarranca", "San Andrés Tenejapan", "San Andrés Tuxtla", "San Juan Evangelista", "San Rafael", "Santiago Sochiapan", "Santiago Tuxtla", "Sayula de Alemán", "Sochiapa", "Soconusco", "Soledad Atzompa", "Soledad de Doblado", "Soteapan", "Tamalín", "Tamiahua", "Tampico Alto", "Tancoco", "Tantima", "Tantoyuca", "Tatahuicapan de Juárez", "Tatatila", "Tecolutla", "Tehuipango", "Tempoal", "Tenampa", "Tenochtitlán", "Teocelo", "Tepatlaxco", "Tepetlán", "Tepetzintla", "Tequila", "Texcatepec", "Texhuacán", "Texistepec", "Tezonapa", "Tierra Blanca", "Tihuatlán", "Tlachichilco", "Tlacojalpan", "Tlacolulan", "Tlacotalpan", "Tlacotepec de Mejía", "Tlalixcoyan", "Tlalnelhuayocan", "Tlaltetela", "Tlapacoyan", "Tlaquilpa", "Tlilapan", "Tomatlán", "Tonayán", "Totutla", "Tres Valles", "Tuxpan", "Tuxtilla", "Ursulo Galván", "Uxpanapa", "Vega de Alatorre", "Veracruz", "Villa Aldama", "Xalapa", "Xico", "Xoxocotla", "Yanga", "Yecuatla", "Zacualpan", "Zaragoza", "Zentla", "Zongolica", "Zontecomatlán de López y Fuentes", "Zozocolco de Hidalgo", "Álamo Temapache"], "Yucatán": ["Abalá", "Acanceh", "Akil", "Baca", "Bokobá", "Buctzotz", "Cacalchén", "Calotmul", "Cansahcab", "Cantamayec", "Celestún", "Cenotillo", "Chacsinkín", "Chankom", "Chapab", "Chemax", "Chichimilá", "Chicxulub Pueblo", "Chikindzonot", "Chocholá", "Chumayel", "Conkal", "Cuncunul", "Cuzamá", "Dzan", "Dzemul", "Dzidzantún", "Dzilam González", "Dzilam de Bravo", "Dzitás", "Dzoncauich", "Espita", "Halachó", "Hocabá", "Hoctún", "Homún", "Huhí", "Hunucmá", "Ixil", "Izamal", "Kanasín", "Kantunil", "Kaua", "Kinchil", "Kopomá", "Mama", "Maní", "Maxcanú", "Mayapán", "Mocochá", "Motul", "Muna", "Muxupip", "Mérida", "Opichén", "Oxkutzcab", "Panabá", "Peto", "Progreso", "Quintana Roo", "Río Lagartos", "Sacalum", "Samahil", "San Felipe", "Sanahcat", "Santa Elena", "Seyé", "Sinanché", "Sotuta", "Sucilá", "Sudzal", "Suma", "Tahdziú", "Tahmek", "Teabo", "Tecoh", "Tekal de Venegas", "Tekantó", "Tekax", "Tekit", "Tekom", "Telchac Pueblo", "Telchac Puerto", "Temax", "Temozón", "Tepakán", "Tetiz", "Teya", "Ticul", "Timucuy", "Tinum", "Tixcacalcupul", "Tixkokob", "Tixméhuac", "Tixpéhual", "Tizimín", "Tunkás", "Tzucacab", "Uayma", "Ucú", "Umán", "Valladolid", "Xocchel", "Yaxcabá", "Yaxkukul", "Yobaín"], "Zacatecas": ["Apozol", "Apulco", "Atolinga", "Benito Juárez", "Calera", "Cañitas de Felipe Pescador", "Chalchihuites", "Concepción del Oro", "Cuauhtémoc", "El Plateado de Joaquín Amaro", "El Salvador", "Fresnillo", "Genaro Codina", "General Enrique Estrada", "General Francisco R. Murguía", "General Pánfilo Natera", "Guadalupe", "Huanusco", "Jalpa", "Jerez", "Jiménez del Teul", "Juan Aldama", "Juchipila", "Loreto", "Luis Moya", "Mazapil", "Melchor Ocampo", "Mezquital del Oro", "Miguel Auza", "Momax", "Monte Escobedo", "Morelos", "Moyahua de Estrada", "Nochistlán de Mejía", "Noria de Ángeles", "Ojocaliente", "Pinos", "Pánuco", "Río Grande", "Sain Alto", "Santa María de la Paz", "Sombrerete", "Susticacán", "Tabasco", "Tepechitlán", "Tepetongo", "Teúl de González Ortega", "Tlaltenango de Sánchez Román", "Trancoso", "Trinidad García de la Cadena", "Valparaíso", "Vetagrande", "Villa García", "Villa González Ortega", "Villa Hidalgo", "Villa de Cos", "Villanueva", "Zacatecas"]};

const TAXONOMIA_CATALOGO = {
  'Cumpleaños': {
    'Flores y Plantas': ['Todas las flores', 'Rosas', 'Gerberas', 'Tulipanes', 'Orquídeas', 'Combinados', 'Premium', 'Plantas'],
    'Globos': ['Todos los globos', 'Globos Personalizados', 'Combos con globo'],
    'Regalos': ['Joyería', 'Peluches', 'Belleza y Fragancias', 'Velas', 'Diarios y Agendas'],
    'Para quién': ['Para Ella', 'Para Él', 'Para Mamá', 'Para Papá', 'Para Niños']
  },
  'Ocasiones': {
    'Celebraciones': ['Amor/Aniversario', 'Cumpleaños', 'Gracias', 'Nacimiento', 'Graduación', 'Logros', 'Felicitaciones', 'Solo porque sí'],
    'Condolencias': ['Servicios Funerarios', 'Consuelo en Casa'],
    'Momentos Difíciles': ['Mejórate pronto', 'Perdón']
  },
  'Flores y plantas': {
    'Flores': ['Combinados', 'Gerberas', 'Girasoles', 'Lilys y Stargazer', 'Orquídeas', 'Rosas', 'Tulipanes y Cala Lilies'],
    'Por presentación': ['Ramos', 'Jarrón', 'Cajas', 'Coronas Funerarias', 'Canastas'],
    'Premium': ['Flores premium'],
    'Condolencias': ['Servicios Funerarios', 'Consuelo en Casa'],
    'Plantas': ['Mini plantas', 'Plantas medianas', 'Plantas con regalos']
  },
  'Globos': {
    'Por ocasión': ['Cumpleaños', 'Graduación', 'Nacimiento', 'Just Because', 'Mejórate Pronto'],
    'Por Tipo': ['Metálicos', 'Esfera', 'Burbuja', 'Ramilletes', 'Combos'],
    'Para quién': ['Para ella', 'Para Él']
  },
  'Regalos': {
    'Para quién': ['Para Ella', 'Para Él', 'Para Mamá', 'Para Papá'],
    'Otros Regalos': ['Diarios y Agendas', 'Certificados'],
    'Joyería': ['Collares', 'Pulseras', 'Aretes', 'Sets', 'Combos'],
    'Peluches': ['Osos', 'Otros Peluches', 'Combos de peluches'],
    'Belleza y Fragancias': ['Mascarillas', 'Cremas', 'Sets de Belleza', 'Perfumes', 'Combos'],
    'Velas': ['Velas y Aromas'],
    'Regalos Corporativos': ['Personalizados', 'Flores y Plantas', 'Cajas de Regalo']
  }
};

const port = Number(process.env.PORT) || 3000;

app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));

// ---------------------------------------------------------------------------
// Límites de peticiones -- protegen contra ataques de fuerza bruta (adivinar
// contraseñas a punta de intentos) y contra que alguien sature el sitio de
// pedidos o pagos falsos. Los límites de login son estrictos a propósito.
// ---------------------------------------------------------------------------
const limitadorLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' }
});
const limitadorRegistro = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.' }
});
const limitadorPedidos = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos seguidos. Espera unos minutos e inténtalo de nuevo.' }
});
const limitadorPagos = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de pago seguidos. Espera unos minutos e inténtalo de nuevo.' }
});
// Límite general de respaldo para toda la API, generoso para no estorbar el
// uso normal del sitio (catálogo, carrito, etc. hacen varias peticiones).
const limitadorGeneral = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 400,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes desde este dispositivo. Espera un momento.' }
});
app.use('/api/', limitadorGeneral);

if (!process.env.DATABASE_URL) {
  console.error('Falta DATABASE_URL en las variables de entorno.');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ---------------------------------------------------------------------------
// Sesiones (guardadas en PostgreSQL para que sobrevivan reinicios del server).
// ---------------------------------------------------------------------------
const pgSession = require('connect-pg-simple')(session);
let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  sessionSecret = crypto.randomBytes(32).toString('hex');
  console.warn('⚠️  No hay SESSION_SECRET en las variables de entorno. Se generó uno temporal: ' +
    'las sesiones activas se cerrarán cada vez que el servidor reinicie. Agrega SESSION_SECRET a tu .env para evitarlo.');
}
app.use(session({
  store: new pgSession({ pool, tableName: 'sesiones_admin', createTableIfMissing: true }),
  secret: sessionSecret,
  name: 'rf_admin_sid',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 días
    httpOnly: true,
    sameSite: 'lax',
    // Con NODE_ENV=production (Railway ya sirve todo por HTTPS y "trust proxy"
    // está activo arriba), las cookies solo viajan por conexiones seguras.
    // En local (sin HTTPS) se deja apagado para que el login no se rompa.
    secure: process.env.NODE_ENV === 'production'
  }
}));

// ---------------------------------------------------------------------------
// Defensa extra contra CSRF: para cualquier método que cambie datos
// (POST/PUT/PATCH/DELETE) que traiga la cookie de sesión del panel, se
// verifica que la petición venga del propio sitio -- un formulario CSRF
// desde otra página no puede falsificar este encabezado.  Esto se suma a
// que la cookie ya es `sameSite: lax` y a que todas las escrituras del
// panel exigen `Content-Type: application/json` (que un <form> normal de
// otra página no puede enviar).
app.use((req, res, next) => {
  const metodosQueEscriben = ['POST', 'PUT', 'PATCH', 'DELETE'];
  // El webhook de Mercado Pago llega servidor-a-servidor, nunca con un
  // Origin/Referer del propio sitio -- se excluye de esta verificación.
  if (!metodosQueEscriben.includes(req.method) || req.path === '/api/pagos/webhook') return next();
  const origen = req.get('origin') || req.get('referer') || '';
  if (origen && !origen.startsWith(URL_SITIO)) {
    return res.status(403).json({ error: 'Solicitud rechazada por seguridad (origen inválido).' });
  }
  next();
});

// ---------------------------------------------------------------------------
// Subida de imágenes (se guardan en disco y se sirven como estáticas en /uploads)
// En Railway, el disco del contenedor NO es permanente entre despliegues --
// para que las fotos no se borren, hay que:
//   1) Crear un Volume en Railway (pestaña "Volumes" del servicio).
//   2) Montarlo en, por ejemplo, /data/uploads.
//   3) Poner esa misma ruta en la variable de entorno UPLOADS_DIR.
// Si no se configura UPLOADS_DIR, se usa la carpeta local de siempre (útil
// para desarrollo, pero NO persiste en Railway sin un Volume).
// ---------------------------------------------------------------------------
const CARPETA_SUBIDAS = process.env.UPLOADS_DIR || path.join(__dirname, 'public', 'uploads');
fs.mkdirSync(CARPETA_SUBIDAS, { recursive: true });
app.use('/uploads', express.static(CARPETA_SUBIDAS));

const storageSubidas = multer.diskStorage({
  destination: (req, file, cb) => cb(null, CARPETA_SUBIDAS),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '') || '.jpg';
    const nombre = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
    cb(null, nombre);
  }
});
const TIPOS_IMAGEN_VALIDOS = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
const subirImagen = multer({
  storage: storageSubidas,
  limits: { fileSize: 6 * 1024 * 1024 }, // 6MB
  fileFilter: (req, file, cb) => {
    if (!TIPOS_IMAGEN_VALIDOS.has(file.mimetype)) {
      return cb(new Error('Formato de imagen no permitido. Usa JPG, PNG, WEBP, GIF o AVIF.'));
    }
    cb(null, true);
  }
});

// Para cuando el negocio sube el PDF (y opcionalmente el XML) de una factura ya
// generada por su cuenta -- acepta PDF y XML, nunca imágenes ni ejecutables.
const TIPOS_FACTURA_VALIDOS = new Set(['application/pdf', 'text/xml', 'application/xml']);
const subirFactura = multer({
  storage: storageSubidas,
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!TIPOS_FACTURA_VALIDOS.has(file.mimetype)) {
      return cb(new Error('Sube un archivo PDF o XML.'));
    }
    cb(null, true);
  }
});

// ---------------------------------------------------------------------------
// URLs limpias (sin ".html"): cada página también se sirve en su ruta corta.
// Los enlaces del sitio ya usan estas rutas; el ".html" de toda la vida
// también se redirige aquí por si alguien lo escribe a mano o entra desde un
// enlace viejo guardado.
// ---------------------------------------------------------------------------
const PAGINAS_LIMPIAS = {
  '/carrito': 'carrito.html',
  '/checkout': 'checkout.html',
  '/gracias': 'gracias.html',
  '/cuenta': 'cuenta.html',
  '/centro-ayuda': 'centro-ayuda.html',
  '/admin': 'admin.html',
  '/cobertura': 'cobertura.html',
  '/pedidos-corporativos': 'pedidos-corporativos.html'
};
for (const [rutaLimpia, archivo] of Object.entries(PAGINAS_LIMPIAS)) {
  app.get(rutaLimpia, (req, res) => res.sendFile(path.join(__dirname, 'public', archivo)));
  // El enlace clásico con ".html" redirige a la versión limpia, conservando
  // cualquier query string o "hash" (el hash no llega al servidor, pero el
  // navegador lo vuelve a agregar solo tras la redirección).
  app.get(`${rutaLimpia}.html`, (req, res) => {
    const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    res.redirect(301, rutaLimpia + query);
  });
}

// Sitemap dinámico: antes solo tenía la portada -- ahora se genera solo,
// listando también cada producto activo, para que Google los pueda
// encontrar e indexar (aprovechando los datos estructurados que ya trae
// cada página de producto).
// Cache simple en memoria: el sitemap no cambia tan seguido como para
// consultar la base de datos en cada visita de un buscador o un bot --
// se recalcula solo una vez por hora.
let sitemapCacheRF = { xml: null, generadoEn: 0 };
const SITEMAP_CACHE_MS = 60 * 60 * 1000;

app.get('/sitemap.xml', limitadorGeneral, async (req, res) => {
  try {
    if (sitemapCacheRF.xml && (Date.now() - sitemapCacheRF.generadoEn) < SITEMAP_CACHE_MS) {
      res.set('Content-Type', 'application/xml');
      return res.send(sitemapCacheRF.xml);
    }
    const productos = await pool.query('SELECT id FROM arreglos_florales WHERE COALESCE(disponible, true) = true ORDER BY id');
    const urls = [
      `<url><loc>${URL_SITIO}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
      ...productos.rows.map(p => `<url><loc>${URL_SITIO}/producto/${p.id}</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`)
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`;
    sitemapCacheRF = { xml, generadoEn: Date.now() };
    res.set('Content-Type', 'application/xml');
    res.send(xml);
  } catch (error) {
    console.error('GET /sitemap.xml:', error);
    res.status(500).send('Error generando el sitemap.');
  }
});

app.use(express.static(path.join(__dirname, 'public')));

// Las páginas de producto usan el mismo cascarón de la tienda; el frontend carga el ID desde la URL.
app.get('/producto/:id', async (req, res) => {
  const rutaIndex = path.join(__dirname, 'public', 'index.html');
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.sendFile(rutaIndex);
  try {
    const resultado = await pool.query('SELECT id, nombre, descripcion, precio, imagen_url, disponible, stock FROM arreglos_florales WHERE id=$1', [id]);
    if (resultado.rowCount === 0) return res.sendFile(rutaIndex);
    const p = resultado.rows[0];

    // Para que Google pueda mostrar precio y disponibilidad directo en los
    // resultados de búsqueda, se le manda el HTML ya con la información del
    // producto puesta (título, descripción, imagen y el bloque de datos
    // estructurados Product) -- antes esta página era siempre el mismo
    // index.html genérico sin importar qué producto fuera.
    let html = fs.readFileSync(rutaIndex, 'utf8');
    const nombreEscapado = String(p.nombre || '').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    const descripcionPlana = String(p.descripcion || 'Arreglo floral con entrega a domicilio.').replace(/</g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
    const imagenAbsoluta = p.imagen_url
      ? (p.imagen_url.startsWith('http') ? p.imagen_url : `${URL_SITIO}${p.imagen_url}`)
      : `${URL_SITIO}/logo-reserva-floral.png`;
    const tituloProducto = `${nombreEscapado} | Reserva Floral`;

    html = html
      .replace(/<title>.*?<\/title>/, `<title>${tituloProducto}</title>`)
      .replace(/<meta name="description" content=".*?">/, `<meta name="description" content="${descripcionPlana.replace(/"/g, '&quot;')}">`)
      .replace(/<meta property="og:title" content=".*?">/, `<meta property="og:title" content="${tituloProducto}">`)
      .replace(/<meta property="og:description" content=".*?">/, `<meta property="og:description" content="${descripcionPlana.replace(/"/g, '&quot;')}">`)
      .replace(/<meta property="og:image" content=".*?">/, `<meta property="og:image" content="${imagenAbsoluta}">`);

    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: p.nombre,
      description: descripcionPlana,
      image: imagenAbsoluta,
      offers: {
        '@type': 'Offer',
        priceCurrency: 'MXN',
        price: Number(p.precio).toFixed(2),
        availability: (p.disponible !== false && Number(p.stock) > 0) ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        url: `${URL_SITIO}/producto/${p.id}`
      }
    };
    html = html.replace('<!--SEO-JSONLD-->', `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`);

    res.send(html);
  } catch (error) {
    console.error('GET /producto/:id (SEO):', error);
    res.sendFile(rutaIndex);
  }
});

// ---------------------------------------------------------------------------
// Esquema de base de datos
// ---------------------------------------------------------------------------
const columnasProducto = `
  nombre VARCHAR(255) NOT NULL,
  descripcion TEXT,
  especificaciones TEXT,
  precio DECIMAL(10,2) NOT NULL CHECK (precio >= 0),
  imagen_url TEXT,
  imagenes TEXT,
  categoria VARCHAR(100),
  subcategoria VARCHAR(100),
  subsubcategoria VARCHAR(100),
  variante_personalizada TEXT,
  tamanos TEXT,
  cobertura TEXT,
  stock INTEGER DEFAULT 1 CHECK (stock >= 0),
  disponible BOOLEAN DEFAULT true,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
`;

async function inicializarDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS arreglos_florales (
      id SERIAL PRIMARY KEY,
      ${columnasProducto}
    );

    CREATE TABLE IF NOT EXISTS ordenes (
      id SERIAL PRIMARY KEY,
      cliente_nombre VARCHAR(150) NOT NULL,
      cliente_telefono VARCHAR(20) NOT NULL,
      direccion_entrega TEXT NOT NULL,
      fecha_entrega DATE NOT NULL,
      dedicatoria TEXT,
      carrito JSONB NOT NULL DEFAULT '[]'::jsonb,
      total DECIMAL(10,2) NOT NULL CHECK (total >= 0),
      estado VARCHAR(50) DEFAULT 'Pendiente',
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS usuarios_admin (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(150) NOT NULL,
      email VARCHAR(150) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      rol VARCHAR(30) NOT NULL DEFAULT 'editor',
      activo BOOLEAN DEFAULT true,
      ultimo_acceso TIMESTAMP,
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS zonas_cobertura (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(100) UNIQUE NOT NULL,
      etiqueta VARCHAR(100) NOT NULL,
      estado VARCHAR(100),
      activa BOOLEAN DEFAULT true,
      orden INTEGER DEFAULT 0,
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS configuracion (
      clave VARCHAR(100) PRIMARY KEY,
      valor TEXT
    );

    CREATE TABLE IF NOT EXISTS clientes_cuenta (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(100) NOT NULL,
      apellido VARCHAR(100) NOT NULL,
      genero VARCHAR(20),
      email VARCHAR(150) UNIQUE NOT NULL,
      telefono VARCHAR(20),
      password_hash TEXT,
      reset_token_hash TEXT,
      reset_token_expira TIMESTAMP,
      carrito_guardado JSONB,
      carrito_actualizado_en TIMESTAMP,
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS direcciones_cliente (
      id SERIAL PRIMARY KEY,
      cliente_cuenta_id INTEGER NOT NULL REFERENCES clientes_cuenta(id) ON DELETE CASCADE,
      nombre_destinatario VARCHAR(150) NOT NULL,
      telefono_destinatario VARCHAR(20),
      calle VARCHAR(200),
      numero VARCHAR(20),
      colonia VARCHAR(150),
      cp VARCHAR(10),
      ciudad VARCHAR(100),
      estado VARCHAR(100),
      tipo_domicilio VARCHAR(50),
      notas_entrega TEXT,
      lat DECIMAL(10,7),
      lng DECIMAL(10,7),
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS recordatorios_cliente (
      id SERIAL PRIMARY KEY,
      cliente_cuenta_id INTEGER NOT NULL REFERENCES clientes_cuenta(id) ON DELETE CASCADE,
      titulo VARCHAR(150) NOT NULL,
      fecha DATE NOT NULL,
      repetir_anual BOOLEAN DEFAULT true,
      notas TEXT,
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS cupones (
      id SERIAL PRIMARY KEY,
      codigo VARCHAR(50) UNIQUE NOT NULL,
      tipo VARCHAR(20) NOT NULL DEFAULT 'monto_fijo',
      valor DECIMAL(10,2) NOT NULL,
      activo BOOLEAN DEFAULT true,
      monto_minimo DECIMAL(10,2) DEFAULT 0,
      usos_maximos INTEGER,
      usos_actuales INTEGER DEFAULT 0,
      cliente_cuenta_id INTEGER REFERENCES clientes_cuenta(id) ON DELETE CASCADE,
      fecha_inicio DATE,
      fecha_expiracion DATE,
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS carruseles_inicio (
      id SERIAL PRIMARY KEY,
      carrusel VARCHAR(30) NOT NULL,
      titulo VARCHAR(100) NOT NULL,
      imagen_url TEXT NOT NULL,
      enlace VARCHAR(255) NOT NULL,
      orden INTEGER DEFAULT 0,
      activo BOOLEAN DEFAULT true,
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS menu_navegacion (
      id SERIAL PRIMARY KEY,
      padre_id INTEGER REFERENCES menu_navegacion(id) ON DELETE CASCADE,
      nivel INTEGER NOT NULL,
      titulo VARCHAR(100) NOT NULL,
      enlace VARCHAR(255),
      orden INTEGER DEFAULT 0,
      activo BOOLEAN DEFAULT true,
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Un mismo producto puede pertenecer a varias clasificaciones a la vez
    -- (ej. por tipo de flor Y por presentación Y por ocasión) -- antes solo
    -- se guardaba una sola combinación categoría/subcategoría/tipo en
    -- arreglos_florales, lo cual era insuficiente.
    CREATE TABLE IF NOT EXISTS producto_categorias (
      id SERIAL PRIMARY KEY,
      producto_id INTEGER NOT NULL REFERENCES arreglos_florales(id) ON DELETE CASCADE,
      categoria VARCHAR(100) NOT NULL,
      subcategoria VARCHAR(100),
      subsubcategoria VARCHAR(100)
    );
    CREATE INDEX IF NOT EXISTS idx_producto_categorias_producto ON producto_categorias(producto_id);

    -- Combos/paquetes: un producto que en realidad agrupa otros productos
    -- del catálogo (ej. "Ramo + Peluche + Chocolates").
    CREATE TABLE IF NOT EXISTS producto_combo_items (
      id SERIAL PRIMARY KEY,
      producto_id INTEGER NOT NULL REFERENCES arreglos_florales(id) ON DELETE CASCADE,
      componente_id INTEGER NOT NULL REFERENCES arreglos_florales(id) ON DELETE CASCADE,
      cantidad INTEGER NOT NULL DEFAULT 1
    );

    -- Notas internas de un pedido (para el equipo, nunca las ve el cliente).
    CREATE TABLE IF NOT EXISTS pedido_notas (
      id SERIAL PRIMARY KEY,
      orden_id INTEGER NOT NULL REFERENCES ordenes(id) ON DELETE CASCADE,
      autor VARCHAR(150),
      nota TEXT NOT NULL,
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Bitácora de acciones del panel: quién hizo qué y cuándo.
    CREATE TABLE IF NOT EXISTS bitacora_admin (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER REFERENCES usuarios_admin(id) ON DELETE SET NULL,
      usuario_nombre VARCHAR(150),
      accion VARCHAR(100) NOT NULL,
      detalle TEXT,
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_bitacora_fecha ON bitacora_admin(creado_en DESC);

    -- Quien deja su correo en un producto agotado, se le avisa una sola vez
    -- en cuanto vuelva a haber existencia (o se vuelva a activar).
    CREATE TABLE IF NOT EXISTS avisos_restock (
      id SERIAL PRIMARY KEY,
      producto_id INTEGER NOT NULL REFERENCES arreglos_florales(id) ON DELETE CASCADE,
      email VARCHAR(150) NOT NULL,
      avisado BOOLEAN DEFAULT false,
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(producto_id, email)
    );

    -- Carritos que alguien dejó a medias (ya escribió su correo pero no
    -- terminó de pagar) -- para poder recordarle por correo más tarde.
    CREATE TABLE IF NOT EXISTS carritos_abandonados (
      id SERIAL PRIMARY KEY,
      email VARCHAR(150) NOT NULL UNIQUE,
      nombre VARCHAR(150),
      items JSONB NOT NULL,
      total DECIMAL(10,2),
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      correo_enviado BOOLEAN DEFAULT false,
      recuperado BOOLEAN DEFAULT false
    );
  `);

  // Limpieza de tablas huérfanas: durante el desarrollo del menú por
  // categorías, en un momento se crearon estas 3 tablas para un sistema de
  // "etiquetas" que después se descartó a favor de la taxonomía real del
  // catálogo. Si tu base de datos llegó a tener esa versión desplegada, se
  // quedaron creadas sin usarse -- se eliminan aquí, una sola vez.
  await pool.query('DROP TABLE IF EXISTS producto_etiquetas CASCADE');
  await pool.query('DROP TABLE IF EXISTS etiquetas CASCADE');
  await pool.query('DROP TABLE IF EXISTS categorias_catalogo CASCADE');

  // Compatibilidad con instalaciones anteriores de la base de datos.
  const alterQueries = [
    'ALTER TABLE arreglos_florales ADD COLUMN IF NOT EXISTS imagenes TEXT',
    'ALTER TABLE arreglos_florales ADD COLUMN IF NOT EXISTS especificaciones TEXT',
    'ALTER TABLE arreglos_florales ADD COLUMN IF NOT EXISTS tamanos TEXT',
    'ALTER TABLE arreglos_florales ADD COLUMN IF NOT EXISTS cobertura TEXT',
    'ALTER TABLE arreglos_florales ADD COLUMN IF NOT EXISTS subcategoria VARCHAR(100)',
    'ALTER TABLE arreglos_florales ADD COLUMN IF NOT EXISTS subsubcategoria VARCHAR(100)',
    'ALTER TABLE arreglos_florales ADD COLUMN IF NOT EXISTS variante_personalizada TEXT',
    'ALTER TABLE arreglos_florales ADD COLUMN IF NOT EXISTS stock INTEGER DEFAULT 1',
    'ALTER TABLE arreglos_florales ADD COLUMN IF NOT EXISTS disponible BOOLEAN DEFAULT true',
    'ALTER TABLE arreglos_florales ADD COLUMN IF NOT EXISTS es_combo BOOLEAN DEFAULT false',
    'ALTER TABLE arreglos_florales ADD COLUMN IF NOT EXISTS tiempo_entrega_dias INTEGER DEFAULT 0',
    'ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS dedicatoria TEXT',
    "ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS carrito JSONB NOT NULL DEFAULT '[]'::jsonb",
    'ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS destinatario_telefono VARCHAR(20)',
    'ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS tipo_domicilio VARCHAR(50)',
    'ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS notas_entrega TEXT',
    'ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS horario_entrega VARCHAR(50)',
    'ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS lat DECIMAL(10,7)',
    'ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS lng DECIMAL(10,7)',
    'ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS firma VARCHAR(150)',
    'ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS es_anonimo BOOLEAN DEFAULT false',
    'ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS envio DECIMAL(10,2) DEFAULT 0',
    'ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS cliente_cuenta_id INTEGER REFERENCES clientes_cuenta(id) ON DELETE SET NULL',
    'ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS email_contacto VARCHAR(150)',
    "ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS estado_pago VARCHAR(30) DEFAULT 'pendiente'",
    'ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS mp_preference_id VARCHAR(100)',
    'ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS mp_payment_id VARCHAR(100)',
    'ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS cupon_codigo VARCHAR(50)',
    'ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS descuento DECIMAL(10,2) DEFAULT 0',
    'ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS factura_estado VARCHAR(20)',
    'ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS factura_rfc VARCHAR(13)',
    'ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS factura_razon_social VARCHAR(255)',
    'ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS factura_uso_cfdi VARCHAR(10)',
    'ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS factura_cp VARCHAR(10)',
    'ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS factura_email VARCHAR(150)',
    'ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS factura_solicitada_en TIMESTAMP',
    'ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS factura_archivo_url TEXT',
    'ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS factura_atendida_en TIMESTAMP',
    'ALTER TABLE clientes_cuenta ADD COLUMN IF NOT EXISTS puntos_canjeados INTEGER DEFAULT 0',
    'ALTER TABLE clientes_cuenta ADD COLUMN IF NOT EXISTS google_id VARCHAR(100)',
    'ALTER TABLE clientes_cuenta ADD COLUMN IF NOT EXISTS carrito_guardado JSONB',
    'ALTER TABLE clientes_cuenta ADD COLUMN IF NOT EXISTS reset_token_hash TEXT',
    'ALTER TABLE clientes_cuenta ADD COLUMN IF NOT EXISTS reset_token_expira TIMESTAMP',
    'ALTER TABLE clientes_cuenta ADD COLUMN IF NOT EXISTS carrito_actualizado_en TIMESTAMP',
    'ALTER TABLE clientes_cuenta ALTER COLUMN password_hash DROP NOT NULL',
    'ALTER TABLE zonas_cobertura ADD COLUMN IF NOT EXISTS estado VARCHAR(100)',
    'ALTER TABLE cupones ADD COLUMN IF NOT EXISTS fecha_inicio DATE'
  ];

  for (const query of alterQueries) {
    await pool.query(query);
  }

  // Semilla de zonas de cobertura: mismas ciudades que ya se usaban a mano en
  // el panel, para que los productos existentes (cuyo campo "cobertura" ya
  // trae estos valores) no se queden huérfanos.
  const zonasExistentes = await pool.query('SELECT COUNT(*)::int AS n FROM zonas_cobertura');
  if (zonasExistentes.rows[0].n === 0) {
    const zonasIniciales = [
      ['Tampico', 'Tampico', 'Tamaulipas', 1],
      ['Madero', 'Cd. Madero', 'Tamaulipas', 2],
      ['Altamira', 'Altamira', 'Tamaulipas', 3],
      ['Monterrey', 'Monterrey', 'Nuevo León', 4],
      ['CDMX', 'CDMX', 'Ciudad de México', 5]
    ];
    for (const [nombre, etiqueta, estadoZona, orden] of zonasIniciales) {
      await pool.query('INSERT INTO zonas_cobertura (nombre, etiqueta, estado, orden) VALUES ($1,$2,$3,$4) ON CONFLICT (nombre) DO NOTHING', [nombre, etiqueta, estadoZona, orden]);
    }
  }
  // Si el sitio ya tenía zonas de antes de agregar esta columna, se les pone
  // el estado que les corresponde según su nombre (para las 5 de siempre);
  // cualquier zona que el negocio haya agregado después con otro nombre se
  // queda sin estado hasta que la editen a mano en el panel -- no hay forma
  // de adivinarlo con certeza.
  await pool.query(`
    UPDATE zonas_cobertura SET estado = CASE
      WHEN nombre IN ('Tampico', 'Madero', 'Altamira') THEN 'Tamaulipas'
      WHEN nombre = 'Monterrey' THEN 'Nuevo León'
      WHEN nombre = 'CDMX' THEN 'Ciudad de México'
      ELSE estado
    END
    WHERE estado IS NULL
  `);

  // Semilla del contenido de los carruseles del inicio ("Entregas el mismo
  // día..." y "Ocasiones") -- si el negocio ya había subido alguna imagen
  // con el sistema anterior (guardada como configuración suelta), se
  // recupera aquí para no perder ese trabajo; si no, se usan las fotos de
  // muestra de siempre. El enlace de cada una ya usa el formato que sí
  // filtra el catálogo (antes usaban rutas que no hacían nada).
  const carruselesExistentes = await pool.query("SELECT COUNT(*)::int AS n FROM carruseles_inicio");
  const migracionCarruselesHecha = await pool.query("SELECT 1 FROM configuracion WHERE clave = 'migracion_carruseles_v2'");
  const carruselesConBusquedaVieja = migracionCarruselesHecha.rowCount > 0
    ? { rows: [{ n: 0 }] } // ya se corrigió antes -- no se vuelve a revisar, para no borrar por error un enlace que el negocio haya puesto a propósito con "buscar="
    : await pool.query("SELECT COUNT(*)::int AS n FROM carruseles_inicio WHERE enlace LIKE '%buscar=%'");
  if (carruselesConBusquedaVieja.rows[0].n > 0) {
    // Quedaron guardados enlaces de una versión anterior que buscaban por
    // palabra en vez de filtrar de verdad -- se corrigen solos, una vez.
    await pool.query('DELETE FROM carruseles_inicio');
  }
  if (carruselesExistentes.rows[0].n === 0 || carruselesConBusquedaVieja.rows[0].n > 0) {
    const cfgPrevia = await pool.query('SELECT clave, valor FROM configuracion');
    const cfg = {};
    cfgPrevia.rows.forEach(fila => { cfg[fila.clave] = fila.valor; });

    const categoriasIniciales = [
      ['Flores', cfg.carrusel_categoria_flores || 'https://images.unsplash.com/photo-1591886960571-74d43a9d4166?q=80&w=900&auto=format&fit=crop', '/?categoria=' + encodeURIComponent('Flores y plantas'), 1],
      ['Globos', cfg.carrusel_categoria_globos || 'https://img.flowers.ua/images/Flowers/ext/1908_1.jpg', '/?categoria=Globos', 2],
      ['Regalos', cfg.carrusel_categoria_regalos || 'https://images.unsplash.com/photo-1513201099705-a9746e1e201f?q=80&w=900&auto=format&fit=crop', '/?categoria=Regalos', 3],
      ['Plantas', cfg.carrusel_categoria_plantas || 'https://images.unsplash.com/photo-1485955900006-10f4d324d411?q=80&w=900&auto=format&fit=crop', '/?categoria=' + encodeURIComponent('Flores y plantas'), 4],
      ['Joyería', cfg.carrusel_categoria_joyeria || 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?q=80&w=900&auto=format&fit=crop', '/?categoria=Regalos', 5],
      ['Línea Premium', cfg.carrusel_categoria_premium || 'https://images.unsplash.com/photo-1490750967868-88aa4486c946?q=80&w=900&auto=format&fit=crop', '/?categoria=' + encodeURIComponent('Flores y plantas'), 6],
      ['Desde $249', cfg.carrusel_categoria_desde249 || 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?q=80&w=900&auto=format&fit=crop', '/', 7]
    ];
    const ocasionesIniciales = [
      ['Cumpleaños', cfg.carrusel_ocasion_cumpleanos || 'https://images.unsplash.com/photo-1464349153735-e0c7500ce7e0?q=80&w=900&auto=format&fit=crop', '/?categoria=Ocasiones&subcategoria=Celebraciones&subsubcategoria=Cumplea%C3%B1os', 1],
      ['Amor y Aniversario', cfg.carrusel_ocasion_amor || 'https://images.unsplash.com/photo-1518895949257-7621c3c786d7?q=80&w=900&auto=format&fit=crop', '/?categoria=Ocasiones&subcategoria=Celebraciones&subsubcategoria=Amor%2FAniversario', 2],
      ['Condolencias', cfg.carrusel_ocasion_condolencias || 'https://images.unsplash.com/photo-1587594905449-2b4ca337d2f1?q=80&w=900&auto=format&fit=crop', '/?categoria=Ocasiones&subcategoria=Condolencias', 3],
      ['Gracias', cfg.carrusel_ocasion_gracias || 'https://images.unsplash.com/photo-1487070183336-b863922373d4?q=80&w=900&auto=format&fit=crop', '/?categoria=Ocasiones&subcategoria=Celebraciones&subsubcategoria=Gracias', 4],
      ['Bride to be', cfg.carrusel_ocasion_bride || 'https://images.unsplash.com/photo-1520854221256-17451cc331bf?q=80&w=900&auto=format&fit=crop', '/?categoria=Ocasiones', 5],
      ['Mejórate pronto', cfg.carrusel_ocasion_mejorate || 'https://images.unsplash.com/photo-1526047932273-341f2a7631f9?q=80&w=900&auto=format&fit=crop', '/?categoria=Ocasiones&subcategoria=Momentos%20Dif%C3%ADciles&subsubcategoria=Mejórate%20pronto', 6]
    ];
    for (const [titulo, imagen, enlace, orden] of categoriasIniciales) {
      await pool.query('INSERT INTO carruseles_inicio (carrusel, titulo, imagen_url, enlace, orden) VALUES ($1,$2,$3,$4,$5)', ['categorias', titulo, imagen, enlace, orden]);
    }
    for (const [titulo, imagen, enlace, orden] of ocasionesIniciales) {
      await pool.query('INSERT INTO carruseles_inicio (carrusel, titulo, imagen_url, enlace, orden) VALUES ($1,$2,$3,$4,$5)', ['ocasiones', titulo, imagen, enlace, orden]);
    }
    // Las llaves sueltas del sistema anterior ya quedaron migradas a filas de
    // verdad -- se limpian para no dejar configuración huérfana.
    await pool.query(`DELETE FROM configuracion WHERE clave LIKE 'carrusel_categoria_%' OR clave LIKE 'carrusel_ocasion_%'`);
  }
  // Bandera de "ya se revisó esto" -- para que la limpieza de arriba nunca
  // se repita sola más adelante, incluso si el negocio llega a guardar a
  // propósito un enlace que contenga "buscar=".
  await pool.query(`INSERT INTO configuracion (clave, valor) VALUES ('migracion_carruseles_v2', '1') ON CONFLICT (clave) DO NOTHING`);



  // Semilla del menú de navegación (las 6 pestañas de arriba y todos sus
  // submenús), usando exactamente la misma taxonomía categoría > subcategoría
  // > tipo con la que se etiquetan los productos en el panel (TAXONOMIA_CATALOGO,
  // más abajo en este archivo). Así, un enlace del menú y la clasificación real
  // de un producto son la misma cosa -- no una búsqueda por palabra.
  const menuExistente = await pool.query('SELECT COUNT(*)::int AS n FROM menu_navegacion');
  const migracionMenuHecha = await pool.query("SELECT 1 FROM configuracion WHERE clave = 'migracion_menu_v2'");
  const menuConBusquedaVieja = migracionMenuHecha.rowCount > 0
    ? { rows: [{ n: 0 }] } // ya se corrigió antes -- no se vuelve a revisar
    : await pool.query("SELECT COUNT(*)::int AS n FROM menu_navegacion WHERE enlace LIKE '%buscar=%'");
  if (menuConBusquedaVieja.rows[0].n > 0) {
    // Igual que arriba: se corrige solo, una vez, si quedó algo de una
    // versión anterior que usaba búsqueda por palabra en vez de un filtro real.
    await pool.query('DELETE FROM menu_navegacion');
  }
  if (menuExistente.rows[0].n === 0 || menuConBusquedaVieja.rows[0].n > 0) {
    async function crearPestaña(titulo, categoria, orden, columnas) {
      const pestaña = await pool.query(
        'INSERT INTO menu_navegacion (padre_id, nivel, titulo, enlace, orden) VALUES (NULL,0,$1,$2,$3) RETURNING id',
        [titulo, categoria ? '/?categoria=' + encodeURIComponent(categoria) : '/', orden]
      );
      const pestañaId = pestaña.rows[0].id;
      let i = 0;
      for (const [subcategoria, tipos] of Object.entries(columnas)) {
        i++;
        const columna = await pool.query(
          'INSERT INTO menu_navegacion (padre_id, nivel, titulo, enlace, orden) VALUES ($1,1,$2,$3,$4) RETURNING id',
          [pestañaId, subcategoria, categoria ? '/?categoria=' + encodeURIComponent(categoria) + '&subcategoria=' + encodeURIComponent(subcategoria) : null, i]
        );
        const columnaId = columna.rows[0].id;
        for (let j = 0; j < tipos.length; j++) {
          const enlace = '/?categoria=' + encodeURIComponent(categoria) + '&subcategoria=' + encodeURIComponent(subcategoria) + '&subsubcategoria=' + encodeURIComponent(tipos[j]);
          await pool.query(
            'INSERT INTO menu_navegacion (padre_id, nivel, titulo, enlace, orden) VALUES ($1,2,$2,$3,$4)',
            [columnaId, tipos[j], enlace, j + 1]
          );
        }
      }
    }

    await crearPestaña('Inicio', null, 1, {});
    let orden = 2;
    for (const [categoria, columnas] of Object.entries(TAXONOMIA_CATALOGO)) {
      await crearPestaña(categoria, categoria, orden++, columnas);
    }
  }
  await pool.query(`INSERT INTO configuracion (clave, valor) VALUES ('migracion_menu_v2', '1') ON CONFLICT (clave) DO NOTHING`);

  console.log('Base de datos lista.');
}

// ---------------------------------------------------------------------------
// Auth: middlewares y utilidades
// ---------------------------------------------------------------------------
const intentosLogin = new Map(); // email -> { fallos, bloqueadoHasta }
const LIMITE_INTENTOS = 6;
const BLOQUEO_MS = 15 * 60 * 1000;

function registrarIntentoFallido(email) {
  const clave = email.toLowerCase();
  const registro = intentosLogin.get(clave) || { fallos: 0, bloqueadoHasta: 0 };
  registro.fallos += 1;
  if (registro.fallos >= LIMITE_INTENTOS) {
    registro.bloqueadoHasta = Date.now() + BLOQUEO_MS;
  }
  intentosLogin.set(clave, registro);
}
function limpiarIntentos(email) {
  intentosLogin.delete(email.toLowerCase());
}
function estaBloqueado(email) {
  const registro = intentosLogin.get(email.toLowerCase());
  if (!registro) return false;
  if (registro.bloqueadoHasta && registro.bloqueadoHasta > Date.now()) return true;
  if (registro.bloqueadoHasta && registro.bloqueadoHasta <= Date.now()) {
    intentosLogin.delete(email.toLowerCase());
    return false;
  }
  return false;
}

// El panel tiene mucho más poder que una cuenta de cliente (cambia precios,
// ve datos de todos los pedidos) -- por eso, aparte de la cookie de sesión
// de 7 días, se cierra sola tras 8 horas sin actividad en el panel, aunque
// el navegador siga con la cookie vigente.
const INACTIVIDAD_MAXIMA_ADMIN_MS = 8 * 60 * 60 * 1000;
function requireAuth(req, res, next) {
  if (!req.session || !req.session.usuarioId) {
    return res.status(401).json({ error: 'Debes iniciar sesión.' });
  }
  const ahora = Date.now();
  if (req.session.ultimaActividadAdmin && (ahora - req.session.ultimaActividadAdmin) > INACTIVIDAD_MAXIMA_ADMIN_MS) {
    req.session.destroy(() => {});
    return res.status(401).json({ error: 'Tu sesión expiró por inactividad. Vuelve a iniciar sesión.' });
  }
  req.session.ultimaActividadAdmin = ahora;
  next();
}
function requireAdmin(req, res, next) {
  if (req.session && req.session.usuarioId && req.session.rol === 'admin') return next();
  res.status(403).json({ error: 'Esta acción requiere permisos de administrador.' });
}

// Bitácora: registra quién hizo qué desde el panel. Nunca debe tumbar la
// acción principal si falla -- por eso siempre atrapa su propio error.
async function registrarBitacora(req, accion, detalle) {
  try {
    await pool.query(
      'INSERT INTO bitacora_admin (usuario_id, usuario_nombre, accion, detalle) VALUES ($1,$2,$3,$4)',
      [req.session?.usuarioId || null, req.session?.nombre || 'Alguien', accion, detalle || null]
    );
  } catch (error) {
    console.error('No se pudo registrar en la bitácora:', error?.message || error);
  }
}

function usuarioPublico(row) {
  return {
    id: row.id,
    nombre: row.nombre,
    email: row.email,
    rol: row.rol,
    activo: row.activo,
    ultimo_acceso: row.ultimo_acceso,
    creado_en: row.creado_en
  };
}

// --- Estado de sesión / primer arranque ---
app.get('/api/admin/auth/estado', async (req, res) => {
  try {
    const conteo = await pool.query('SELECT COUNT(*)::int AS n FROM usuarios_admin');
    const requiereConfiguracionInicial = conteo.rows[0].n === 0;
    if (req.session && req.session.usuarioId) {
      return res.json({
        autenticado: true,
        requiereConfiguracionInicial: false,
        usuario: { id: req.session.usuarioId, nombre: req.session.nombre, email: req.session.email, rol: req.session.rol }
      });
    }
    res.json({ autenticado: false, requiereConfiguracionInicial });
  } catch (error) {
    console.error('GET /api/admin/auth/estado:', error);
    res.status(500).json({ error: 'No se pudo verificar la sesión.' });
  }
});

// --- Crear la primera cuenta de administrador (solo si no existe ninguna) ---
app.post('/api/admin/auth/configurar-inicial', limitadorLogin, async (req, res) => {
  const { nombre, email, password } = req.body || {};
  if (!nombre?.trim() || !email?.trim() || !password || password.length < 8) {
    return res.status(400).json({ error: 'Nombre, correo y una contraseña de al menos 8 caracteres son obligatorios.' });
  }
  try {
    const conteo = await pool.query('SELECT COUNT(*)::int AS n FROM usuarios_admin');
    if (conteo.rows[0].n > 0) {
      return res.status(409).json({ error: 'Ya existe una cuenta de administrador. Inicia sesión normalmente.' });
    }
    const hash = await bcrypt.hash(password, 12);
    const resultado = await pool.query(
      `INSERT INTO usuarios_admin (nombre, email, password_hash, rol, activo, ultimo_acceso)
       VALUES ($1,$2,$3,'admin',true,CURRENT_TIMESTAMP) RETURNING *`,
      [nombre.trim(), email.trim().toLowerCase(), hash]
    );
    const usuario = resultado.rows[0];
    req.session.usuarioId = usuario.id;
    req.session.nombre = usuario.nombre;
    req.session.email = usuario.email;
    req.session.rol = usuario.rol;
    res.status(201).json({ usuario: usuarioPublico(usuario) });
  } catch (error) {
    console.error('POST /api/admin/auth/configurar-inicial:', error);
    res.status(500).json({ error: 'No se pudo crear la cuenta de administrador.' });
  }
});

// --- Login / logout ---
app.post('/api/admin/auth/login', limitadorLogin, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email?.trim() || !password) {
    return res.status(400).json({ error: 'Ingresa tu correo y contraseña.' });
  }
  if (estaBloqueado(email)) {
    return res.status(429).json({ error: 'Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo.' });
  }
  try {
    const resultado = await pool.query('SELECT * FROM usuarios_admin WHERE lower(email) = lower($1)', [email.trim()]);
    const usuario = resultado.rows[0];
    if (!usuario || !usuario.activo) {
      registrarIntentoFallido(email);
      return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    }
    const coincide = await bcrypt.compare(password, usuario.password_hash);
    if (!coincide) {
      registrarIntentoFallido(email);
      return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    }
    limpiarIntentos(email);
    await pool.query('UPDATE usuarios_admin SET ultimo_acceso = CURRENT_TIMESTAMP WHERE id = $1', [usuario.id]);
    req.session.regenerate((err) => {
      if (err) {
        console.error('Error regenerando sesión:', err);
        return res.status(500).json({ error: 'No se pudo iniciar sesión.' });
      }
      req.session.usuarioId = usuario.id;
      req.session.nombre = usuario.nombre;
      req.session.email = usuario.email;
      req.session.rol = usuario.rol;
      res.json({ usuario: usuarioPublico(usuario) });
    });
  } catch (error) {
    console.error('POST /api/admin/auth/login:', error);
    res.status(500).json({ error: 'Error del servidor al iniciar sesión.' });
  }
});

app.post('/api/admin/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('rf_admin_sid');
    res.json({ exito: true });
  });
});

app.patch('/api/admin/perfil/password', requireAuth, async (req, res) => {
  const { passwordActual, passwordNueva } = req.body || {};
  if (!passwordActual || !passwordNueva || passwordNueva.length < 8) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres.' });
  }
  try {
    const resultado = await pool.query('SELECT * FROM usuarios_admin WHERE id = $1', [req.session.usuarioId]);
    const usuario = resultado.rows[0];
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado.' });
    const coincide = await bcrypt.compare(passwordActual, usuario.password_hash);
    if (!coincide) return res.status(401).json({ error: 'Tu contraseña actual no es correcta.' });
    const hash = await bcrypt.hash(passwordNueva, 12);
    await pool.query('UPDATE usuarios_admin SET password_hash = $1 WHERE id = $2', [hash, usuario.id]);
    res.json({ exito: true });
  } catch (error) {
    console.error('PATCH /api/admin/perfil/password:', error);
    res.status(500).json({ error: 'No se pudo actualizar la contraseña.' });
  }
});

// ---------------------------------------------------------------------------
// Cuentas de cliente (tienda) -- independientes de las cuentas del panel.
// ---------------------------------------------------------------------------
const intentosLoginCliente = new Map();
function clienteEstaBloqueado(email) {
  const registro = intentosLoginCliente.get(email.toLowerCase());
  if (!registro) return false;
  if (registro.bloqueadoHasta && registro.bloqueadoHasta > Date.now()) return true;
  if (registro.bloqueadoHasta && registro.bloqueadoHasta <= Date.now()) { intentosLoginCliente.delete(email.toLowerCase()); return false; }
  return false;
}
function registrarIntentoFallidoCliente(email) {
  const clave = email.toLowerCase();
  const registro = intentosLoginCliente.get(clave) || { fallos: 0, bloqueadoHasta: 0 };
  registro.fallos += 1;
  if (registro.fallos >= LIMITE_INTENTOS) registro.bloqueadoHasta = Date.now() + BLOQUEO_MS;
  intentosLoginCliente.set(clave, registro);
}

function requireClienteAuth(req, res, next) {
  if (req.session && req.session.clienteId) return next();
  res.status(401).json({ error: 'Debes iniciar sesión.' });
}

function clientePublico(row) {
  return { id: row.id, nombre: row.nombre, apellido: row.apellido, genero: row.genero, email: row.email, telefono: row.telefono, creado_en: row.creado_en };
}

app.get('/api/cuenta/sesion', (req, res) => {
  if (req.session && req.session.clienteId) {
    return res.json({ autenticado: true, cliente: { id: req.session.clienteId, nombre: req.session.clienteNombre, apellido: req.session.clienteApellido, email: req.session.clienteEmail } });
  }
  res.json({ autenticado: false });
});

app.post('/api/cuenta/registro', limitadorRegistro, async (req, res) => {
  const { nombre, apellido, genero, email, telefono, password } = req.body || {};
  if (!nombre?.trim() || !apellido?.trim() || !email?.trim() || !password || password.length < 8) {
    return res.status(400).json({ error: 'Nombre, apellido, correo y una contraseña de al menos 8 caracteres son obligatorios.' });
  }
  try {
    const hash = await bcrypt.hash(password, 12);
    const resultado = await pool.query(
      `INSERT INTO clientes_cuenta (nombre, apellido, genero, email, telefono, password_hash) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [nombre.trim(), apellido.trim(), genero || null, email.trim().toLowerCase(), telefono?.trim() || null, hash]
    );
    const cliente = resultado.rows[0];
    // Si ya había hecho pedidos como invitado con este mismo correo, se los
    // ligamos a la cuenta nueva -- así puede verlos en "Mis pedidos" y sus
    // puntos ya cuentan desde antes de haberse registrado.
    await pool.query(
      `UPDATE ordenes SET cliente_cuenta_id=$1 WHERE cliente_cuenta_id IS NULL AND email_contacto=$2`,
      [cliente.id, cliente.email]
    );
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: 'No se pudo crear la cuenta.' });
      req.session.clienteId = cliente.id;
      req.session.clienteNombre = cliente.nombre;
      req.session.clienteApellido = cliente.apellido;
      req.session.clienteEmail = cliente.email;
      res.status(201).json({ cliente: clientePublico(cliente) });
    });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' });
    console.error('POST /api/cuenta/registro:', error);
    res.status(500).json({ error: 'No se pudo crear la cuenta.' });
  }
});

app.post('/api/cuenta/login', limitadorLogin, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email?.trim() || !password) return res.status(400).json({ error: 'Ingresa tu correo y contraseña.' });
  if (clienteEstaBloqueado(email)) return res.status(429).json({ error: 'Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo.' });
  try {
    const resultado = await pool.query('SELECT * FROM clientes_cuenta WHERE lower(email) = lower($1)', [email.trim()]);
    const cliente = resultado.rows[0];
    if (!cliente) { registrarIntentoFallidoCliente(email); return res.status(401).json({ error: 'Correo o contraseña incorrectos.' }); }
    if (!cliente.password_hash) { registrarIntentoFallidoCliente(email); return res.status(401).json({ error: 'Esta cuenta se creó con Google. Usa el botón "Continuar con Google" para entrar.' }); }
    const coincide = await bcrypt.compare(password, cliente.password_hash);
    if (!coincide) { registrarIntentoFallidoCliente(email); return res.status(401).json({ error: 'Correo o contraseña incorrectos.' }); }
    intentosLoginCliente.delete(email.toLowerCase());
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: 'No se pudo iniciar sesión.' });
      req.session.clienteId = cliente.id;
      req.session.clienteNombre = cliente.nombre;
      req.session.clienteApellido = cliente.apellido;
      req.session.clienteEmail = cliente.email;
      res.json({ cliente: clientePublico(cliente) });
    });
  } catch (error) {
    console.error('POST /api/cuenta/login:', error);
    res.status(500).json({ error: 'Error del servidor al iniciar sesión.' });
  }
});

app.post('/api/cuenta/logout', (req, res) => {
  delete req.session.clienteId;
  delete req.session.clienteNombre;
  delete req.session.clienteApellido;
  res.json({ exito: true });
});

// El token se manda por correo en texto plano, pero en la base de datos solo
// se guarda su hash -- así, ni con acceso a la base de datos alguien podría
// usar un token ajeno para entrar a restablecer la contraseña de otra
// persona. Es un hash simple (no bcrypt): el token ya es aleatorio y de
// alta entropía por sí mismo, así que no hace falta el costo extra de
// bcrypt (pensado para contraseñas cortas que alguien podría adivinar).
function hashTokenRF(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

app.post('/api/cuenta/recuperar-password', limitadorLogin, async (req, res) => {
  const { email } = req.body || {};
  if (!email?.trim()) return res.status(400).json({ error: 'Ingresa tu correo electrónico.' });
  // La respuesta es siempre la misma exista o no la cuenta -- si dijera
  // "ese correo no existe", cualquiera podría usar esto para averiguar qué
  // correos sí tienen cuenta en el sitio.
  const respuestaGenerica = { exito: true, mensaje: 'Si ese correo tiene una cuenta, te mandamos instrucciones para restablecer tu contraseña.' };
  try {
    const resultado = await pool.query('SELECT * FROM clientes_cuenta WHERE lower(email) = lower($1)', [email.trim()]);
    const cliente = resultado.rows[0];
    if (!cliente) return res.json(respuestaGenerica);

    if (!cliente.password_hash) {
      // Cuenta creada con Google -- no tiene una contraseña que restablecer.
      // Se le avisa por correo (no en la respuesta, para no revelar por esta
      // vía si la cuenta existe o no) para que sepa cómo entrar de verdad.
      if (resendClient) {
        const cuerpo = `
          <h2 style="font-size:16px;margin:0 0 8px;">Tu cuenta usa Google para entrar</h2>
          <p style="font-size:13px;color:#666;">Vimos que pediste restablecer tu contraseña, pero tu cuenta en Reserva Floral se creó con Google -- no tiene una contraseña propia. Usa el botón "Continuar con Google" para iniciar sesión.</p>
        `;
        resendClient.emails.send({
          from: CORREO_REMITENTE, to: cliente.email, subject: 'Tu cuenta usa Google para entrar',
          html: await plantillaBaseCorreo('Inicia sesión con Google', cuerpo)
        }).catch(err => console.error('No se pudo avisar sobre cuenta de Google:', err?.message || err));
      }
      return res.json(respuestaGenerica);
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expira = new Date(Date.now() + 60 * 60 * 1000); // 1 hora
    await pool.query('UPDATE clientes_cuenta SET reset_token_hash=$1, reset_token_expira=$2 WHERE id=$3', [hashTokenRF(token), expira, cliente.id]);

    if (resendClient) {
      const enlace = `${URL_SITIO}/cuenta?restablecer=${token}`;
      const cuerpo = `
        <h2 style="font-size:16px;margin:0 0 8px;">Restablece tu contraseña</h2>
        <p style="font-size:13px;color:#666;margin:0 0 16px;">Alguien (probablemente tú) pidió restablecer la contraseña de tu cuenta en Reserva Floral. Si no fuiste tú, puedes ignorar este correo -- tu contraseña actual sigue funcionando igual.</p>
        <p style="margin:0 0 16px;"><a href="${enlace}" style="background:#c2185b;color:#fff;padding:10px 24px;border-radius:999px;text-decoration:none;font-size:13px;font-weight:600;">Elegir una nueva contraseña</a></p>
        <p style="font-size:12px;color:#999;">Este enlace vale por 1 hora.</p>
      `;
      await resendClient.emails.send({
        from: CORREO_REMITENTE, to: cliente.email, subject: 'Restablece tu contraseña — Reserva Floral',
        html: await plantillaBaseCorreo('Restablece tu contraseña', cuerpo)
      });
    }
    res.json(respuestaGenerica);
  } catch (error) {
    console.error('POST /api/cuenta/recuperar-password:', error);
    // Aun si algo falla, no conviene revelar detalles del error por esta vía.
    res.json(respuestaGenerica);
  }
});

app.post('/api/cuenta/restablecer-password', limitadorLogin, async (req, res) => {
  const { token, password } = req.body || {};
  if (!token?.trim() || !password || password.length < 8) {
    return res.status(400).json({ error: 'Ingresa una contraseña de al menos 8 caracteres.' });
  }
  try {
    const resultado = await pool.query(
      'SELECT * FROM clientes_cuenta WHERE reset_token_hash=$1 AND reset_token_expira > NOW()',
      [hashTokenRF(token.trim())]
    );
    const cliente = resultado.rows[0];
    if (!cliente) {
      return res.status(400).json({ error: 'Este enlace ya venció o no es válido. Pide uno nuevo.' });
    }
    const hash = await bcrypt.hash(password, 12);
    await pool.query('UPDATE clientes_cuenta SET password_hash=$1, reset_token_hash=NULL, reset_token_expira=NULL WHERE id=$2', [hash, cliente.id]);
    res.json({ exito: true });
  } catch (error) {
    console.error('POST /api/cuenta/restablecer-password:', error);
    res.status(500).json({ error: 'No se pudo restablecer la contraseña.' });
  }
});

// ---------------------------------------------------------------------------
// Inicio de sesión con Google
// Variables de entorno necesarias:
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET  -- de Google Cloud Console
//   URL_SITIO  -- ej. https://www.reservafloral.com (para armar el redirect)
// Mientras no estén configuradas, el botón de "Continuar con Google" se queda
// deshabilitado en el sitio -- nunca se rompe el login normal por esto.
// ---------------------------------------------------------------------------
const URL_SITIO = process.env.URL_SITIO || 'http://localhost:3000';
const googleClient = (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
  ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, `${URL_SITIO}/api/auth/google/callback`)
  : null;

app.get('/api/auth/estado', (req, res) => {
  res.json({ google: Boolean(googleClient) });
});

app.get('/api/auth/google', (req, res) => {
  if (!googleClient) return res.status(503).send('El inicio de sesión con Google todavía no está configurado.');
  const url = googleClient.generateAuthUrl({
    access_type: 'online',
    scope: ['openid', 'email', 'profile'],
    // Para poder regresar a la misma página después de iniciar sesión
    // (ej. si venía del checkout), guardamos a dónde volver en "state".
    state: encodeURIComponent(req.query.volverA || '/')
  });
  res.redirect(url);
});

app.get('/api/auth/google/callback', async (req, res) => {
  const volverA = (() => { try { return decodeURIComponent(req.query.state || '/'); } catch (_) { return '/'; } })();
  if (!googleClient) return res.redirect('/');
  const { code } = req.query;
  if (!code) return res.redirect(`${volverA}?login=error`);
  try {
    const { tokens } = await googleClient.getToken(code);
    const ticket = await googleClient.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_CLIENT_ID });
    const perfil = ticket.getPayload();
    if (!perfil?.email || !perfil.email_verified) return res.redirect(`${volverA}?login=error`);

    const email = perfil.email.toLowerCase();
    let resultado = await pool.query('SELECT * FROM clientes_cuenta WHERE lower(email) = lower($1)', [email]);
    let cliente = resultado.rows[0];

    if (!cliente) {
      // Cuenta nueva -- se crea sin contraseña, se entra solo con Google.
      const nombre = perfil.given_name || perfil.name || 'Cliente';
      const apellido = perfil.family_name || '';
      const inserted = await pool.query(
        `INSERT INTO clientes_cuenta (nombre, apellido, email, google_id, password_hash) VALUES ($1,$2,$3,$4,NULL) RETURNING *`,
        [nombre, apellido, email, perfil.sub]
      );
      cliente = inserted.rows[0];
      // Igual que en el registro normal: si ya había pedidos de invitado con
      // este correo, se ligan a la cuenta nueva.
      await pool.query(`UPDATE ordenes SET cliente_cuenta_id=$1 WHERE cliente_cuenta_id IS NULL AND email_contacto=$2`, [cliente.id, email]);
    } else if (!cliente.google_id) {
      // Ya tenía cuenta con contraseña y ahora también quiere entrar con
      // Google -- se vincula, sin tocar su contraseña actual.
      await pool.query('UPDATE clientes_cuenta SET google_id=$1 WHERE id=$2', [perfil.sub, cliente.id]);
    }

    req.session.regenerate((err) => {
      if (err) return res.redirect(`${volverA}?login=error`);
      req.session.clienteId = cliente.id;
      req.session.clienteNombre = cliente.nombre;
      req.session.clienteApellido = cliente.apellido;
      req.session.clienteEmail = cliente.email;
      res.redirect(volverA);
    });
  } catch (error) {
    console.error('GET /api/auth/google/callback:', error);
    res.redirect(`${volverA}?login=error`);
  }
});

app.get('/api/cuenta/perfil', requireClienteAuth, async (req, res) => {
  try {
    const resultado = await pool.query('SELECT * FROM clientes_cuenta WHERE id=$1', [req.session.clienteId]);
    if (resultado.rowCount === 0) return res.status(404).json({ error: 'Cuenta no encontrada.' });
    res.json(clientePublico(resultado.rows[0]));
  } catch (error) {
    console.error('GET /api/cuenta/perfil:', error);
    res.status(500).json({ error: 'No se pudo cargar tu perfil.' });
  }
});

app.patch('/api/cuenta/perfil', requireClienteAuth, async (req, res) => {
  const campos = []; const valores = []; let i = 1;
  if (typeof req.body.nombre === 'string' && req.body.nombre.trim()) { campos.push(`nombre=$${i++}`); valores.push(req.body.nombre.trim()); }
  if (typeof req.body.apellido === 'string' && req.body.apellido.trim()) { campos.push(`apellido=$${i++}`); valores.push(req.body.apellido.trim()); }
  if (typeof req.body.genero === 'string') { campos.push(`genero=$${i++}`); valores.push(req.body.genero || null); }
  if (typeof req.body.telefono === 'string') { campos.push(`telefono=$${i++}`); valores.push(req.body.telefono.trim() || null); }
  if (campos.length === 0) return res.status(400).json({ error: 'No hay cambios para guardar.' });
  valores.push(req.session.clienteId);
  try {
    const resultado = await pool.query(`UPDATE clientes_cuenta SET ${campos.join(', ')} WHERE id=$${i} RETURNING *`, valores);
    if (resultado.rowCount === 0) return res.status(404).json({ error: 'Cuenta no encontrada.' });
    req.session.clienteNombre = resultado.rows[0].nombre;
    req.session.clienteApellido = resultado.rows[0].apellido;
    res.json(clientePublico(resultado.rows[0]));
  } catch (error) {
    console.error('PATCH /api/cuenta/perfil:', error);
    res.status(500).json({ error: 'No se pudo actualizar tu perfil.' });
  }
});

app.patch('/api/cuenta/password', requireClienteAuth, async (req, res) => {
  const { passwordActual, passwordNueva } = req.body || {};
  if (!passwordActual || !passwordNueva || passwordNueva.length < 8) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres.' });
  }
  try {
    const resultado = await pool.query('SELECT * FROM clientes_cuenta WHERE id=$1', [req.session.clienteId]);
    const cliente = resultado.rows[0];
    if (!cliente) return res.status(404).json({ error: 'Cuenta no encontrada.' });
    const coincide = await bcrypt.compare(passwordActual, cliente.password_hash);
    if (!coincide) return res.status(401).json({ error: 'Tu contraseña actual no es correcta.' });
    const hash = await bcrypt.hash(passwordNueva, 12);
    await pool.query('UPDATE clientes_cuenta SET password_hash=$1 WHERE id=$2', [hash, cliente.id]);
    res.json({ exito: true });
  } catch (error) {
    console.error('PATCH /api/cuenta/password:', error);
    res.status(500).json({ error: 'No se pudo actualizar la contraseña.' });
  }
});

app.delete('/api/cuenta', requireClienteAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM clientes_cuenta WHERE id=$1', [req.session.clienteId]);
    delete req.session.clienteId;
    delete req.session.clienteNombre;
    delete req.session.clienteApellido;
    res.json({ exito: true });
  } catch (error) {
    console.error('DELETE /api/cuenta:', error);
    res.status(500).json({ error: 'No se pudo eliminar la cuenta.' });
  }
});

app.get('/api/cuenta/pedidos', requireClienteAuth, async (req, res) => {
  try {
    const resultado = await pool.query('SELECT * FROM ordenes WHERE cliente_cuenta_id=$1 ORDER BY id DESC', [req.session.clienteId]);
    res.json(resultado.rows);
  } catch (error) {
    console.error('GET /api/cuenta/pedidos:', error);
    res.status(500).json({ error: 'No se pudieron cargar tus pedidos.' });
  }
});

// El cliente solo puede cancelar SU PROPIO pedido, y solo mientras siga "Pendiente"
// (una vez que la florería lo confirma o empieza a prepararlo, ya no se puede
// cancelar desde aquí -- tendría que llamar/escribir para eso).
app.patch('/api/cuenta/pedidos/:id/cancelar', requireClienteAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido.' });
  try {
    const resultado = await pool.query(
      `UPDATE ordenes SET estado='Cancelado' WHERE id=$1 AND cliente_cuenta_id=$2 AND estado='Pendiente' RETURNING *`,
      [id, req.session.clienteId]
    );
    if (resultado.rowCount === 0) {
      return res.status(409).json({ error: 'Este pedido ya no se puede cancelar (puede que ya esté en preparación o no te pertenezca).' });
    }
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('PATCH /api/cuenta/pedidos/:id/cancelar:', error);
    res.status(500).json({ error: 'No se pudo cancelar el pedido.' });
  }
});

// ---------------------------------------------------------------------------
// Direcciones de envío guardadas (libreta de direcciones del cliente)
// ---------------------------------------------------------------------------
// Solicitar factura para un pedido propio -- el negocio la genera por su
// cuenta con estos datos (no se emite un CFDI real aquí, eso requiere un
// proveedor autorizado por el SAT) y luego sube el archivo ya listo.
const RFC_REGEX = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;
app.post('/api/cuenta/pedidos/:id/solicitar-factura', requireClienteAuth, async (req, res) => {
  const id = Number(req.params.id);
  const { rfc, razonSocial, usoCfdi, codigoPostal, email } = req.body || {};
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido.' });
  if (!rfc?.trim() || !RFC_REGEX.test(rfc.trim().toUpperCase())) {
    return res.status(400).json({ error: 'Ingresa un RFC válido.' });
  }
  if (!razonSocial?.trim() || !usoCfdi?.trim() || !codigoPostal?.trim() || !email?.trim()) {
    return res.status(400).json({ error: 'Completa todos los campos para solicitar tu factura.' });
  }
  try {
    const resultado = await pool.query(
      `UPDATE ordenes SET factura_estado='pendiente', factura_rfc=$1, factura_razon_social=$2,
        factura_uso_cfdi=$3, factura_cp=$4, factura_email=$5, factura_solicitada_en=NOW()
       WHERE id=$6 AND cliente_cuenta_id=$7 RETURNING *`,
      [rfc.trim().toUpperCase(), razonSocial.trim(), usoCfdi.trim(), codigoPostal.trim(), email.trim(), id, req.session.clienteId]
    );
    if (resultado.rowCount === 0) return res.status(404).json({ error: 'No se encontró ese pedido en tu cuenta.' });
    // Le avisamos a los administradores por correo -- si no, la solicitud
    // solo se ve al abrir el panel, y podría pasar desapercibida un buen rato.
    if (resendClient) {
      try {
        const admins = await pool.query("SELECT email FROM usuarios_admin WHERE rol='admin' AND activo=true");
        if (admins.rows.length) {
          const cuerpo = `
            <h2 style="font-size:16px;margin:0 0 8px;">🧾 Nueva solicitud de factura</h2>
            <p style="font-size:13px;color:#666;">El pedido <strong>#${id}</strong> tiene una solicitud de factura nueva, pendiente de subir.</p>
            <p style="font-size:13px;margin:4px 0;"><strong>RFC:</strong> ${rfc.trim().toUpperCase()}</p>
            <p style="font-size:13px;margin:4px 0;"><strong>Razón social:</strong> ${razonSocial.trim()}</p>
            <p style="margin-top:16px;"><a href="${URL_SITIO}/admin" style="background:#c2185b;color:#fff;padding:10px 20px;border-radius:999px;text-decoration:none;font-size:13px;">Ver en el panel</a></p>
          `;
          const htmlCorreo = await plantillaBaseCorreo('Nueva solicitud de factura', cuerpo);
          await Promise.all(admins.rows.map(a => resendClient.emails.send({
            from: CORREO_REMITENTE, to: a.email, subject: `Nueva solicitud de factura — Pedido #${id}`,
            html: htmlCorreo
          }).catch(err => console.error('No se pudo avisar al admin de la solicitud de factura:', err?.message || err))));
        }
      } catch (err) {
        console.error('No se pudo notificar a los administradores sobre la solicitud de factura:', err?.message || err);
      }
    }
    res.json({ exito: true });
  } catch (error) {
    console.error('POST /api/cuenta/pedidos/:id/solicitar-factura:', error);
    res.status(500).json({ error: 'No se pudo enviar tu solicitud de factura.' });
  }
});

// Cancelar una solicitud de factura que sigue pendiente -- por si el
// cliente se equivocó al escribir el RFC o algún otro dato. Si ya está
// "lista" (con el archivo ya subido), ya no se puede cancelar.
app.delete('/api/cuenta/pedidos/:id/solicitar-factura', requireClienteAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido.' });
  try {
    const resultado = await pool.query(
      `UPDATE ordenes SET factura_estado=NULL, factura_rfc=NULL, factura_razon_social=NULL,
        factura_uso_cfdi=NULL, factura_cp=NULL, factura_email=NULL, factura_solicitada_en=NULL
       WHERE id=$1 AND cliente_cuenta_id=$2 AND factura_estado='pendiente' RETURNING id`,
      [id, req.session.clienteId]
    );
    if (resultado.rowCount === 0) {
      return res.status(404).json({ error: 'No se encontró una solicitud pendiente para cancelar.' });
    }
    res.json({ exito: true });
  } catch (error) {
    console.error('DELETE /api/cuenta/pedidos/:id/solicitar-factura:', error);
    res.status(500).json({ error: 'No se pudo cancelar la solicitud.' });
  }
});

app.get('/api/cuenta/direcciones', requireClienteAuth, async (req, res) => {
  try {
    const resultado = await pool.query('SELECT * FROM direcciones_cliente WHERE cliente_cuenta_id=$1 ORDER BY id DESC', [req.session.clienteId]);
    res.json(resultado.rows);
  } catch (error) {
    console.error('GET /api/cuenta/direcciones:', error);
    res.status(500).json({ error: 'No se pudieron cargar tus direcciones.' });
  }
});

function normalizarDireccionBody(body) {
  return {
    nombre_destinatario: String(body.nombreDestinatario || '').trim(),
    telefono_destinatario: String(body.telefonoDestinatario || '').trim() || null,
    calle: String(body.calle || '').trim() || null,
    numero: String(body.numero || '').trim() || null,
    colonia: String(body.colonia || '').trim() || null,
    cp: String(body.cp || '').trim() || null,
    ciudad: String(body.ciudad || '').trim() || null,
    estado: String(body.estado || '').trim() || null,
    tipo_domicilio: String(body.tipoDomicilio || '').trim() || null,
    notas_entrega: String(body.notasEntrega || '').trim() || null,
    lat: Number.isFinite(Number(body.lat)) ? Number(body.lat) : null,
    lng: Number.isFinite(Number(body.lng)) ? Number(body.lng) : null
  };
}

app.post('/api/cuenta/direcciones', requireClienteAuth, async (req, res) => {
  const d = normalizarDireccionBody(req.body);
  if (!d.nombre_destinatario || !d.calle) return res.status(400).json({ error: 'Nombre del destinatario y calle son obligatorios.' });
  try {
    const resultado = await pool.query(`
      INSERT INTO direcciones_cliente
        (cliente_cuenta_id, nombre_destinatario, telefono_destinatario, calle, numero, colonia, cp, ciudad, estado, tipo_domicilio, notas_entrega, lat, lng)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *
    `, [req.session.clienteId, d.nombre_destinatario, d.telefono_destinatario, d.calle, d.numero, d.colonia, d.cp, d.ciudad, d.estado, d.tipo_domicilio, d.notas_entrega, d.lat, d.lng]);
    res.status(201).json(resultado.rows[0]);
  } catch (error) {
    console.error('POST /api/cuenta/direcciones:', error);
    res.status(500).json({ error: 'No se pudo guardar la dirección.' });
  }
});

app.put('/api/cuenta/direcciones/:id', requireClienteAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido.' });
  const d = normalizarDireccionBody(req.body);
  if (!d.nombre_destinatario || !d.calle) return res.status(400).json({ error: 'Nombre del destinatario y calle son obligatorios.' });
  try {
    const resultado = await pool.query(`
      UPDATE direcciones_cliente SET
        nombre_destinatario=$1, telefono_destinatario=$2, calle=$3, numero=$4, colonia=$5, cp=$6,
        ciudad=$7, estado=$8, tipo_domicilio=$9, notas_entrega=$10, lat=$11, lng=$12
      WHERE id=$13 AND cliente_cuenta_id=$14 RETURNING *
    `, [d.nombre_destinatario, d.telefono_destinatario, d.calle, d.numero, d.colonia, d.cp, d.ciudad, d.estado, d.tipo_domicilio, d.notas_entrega, d.lat, d.lng, id, req.session.clienteId]);
    if (resultado.rowCount === 0) return res.status(404).json({ error: 'Dirección no encontrada.' });
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('PUT /api/cuenta/direcciones/:id:', error);
    res.status(500).json({ error: 'No se pudo actualizar la dirección.' });
  }
});

app.delete('/api/cuenta/direcciones/:id', requireClienteAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido.' });
  try {
    const resultado = await pool.query('DELETE FROM direcciones_cliente WHERE id=$1 AND cliente_cuenta_id=$2', [id, req.session.clienteId]);
    if (resultado.rowCount === 0) return res.status(404).json({ error: 'Dirección no encontrada.' });
    res.json({ exito: true });
  } catch (error) {
    console.error('DELETE /api/cuenta/direcciones/:id:', error);
    res.status(500).json({ error: 'No se pudo eliminar la dirección.' });
  }
});

// ---------------------------------------------------------------------------
// Recordatorios de fechas especiales
// Nota: esto guarda y muestra las fechas, pero todavía no envía avisos por
// correo/SMS (no hay un servicio de envíos configurado) -- eso quedaría como
// siguiente paso una vez que se dé de alta un proveedor de correo.
// ---------------------------------------------------------------------------
app.get('/api/cuenta/recordatorios', requireClienteAuth, async (req, res) => {
  try {
    const resultado = await pool.query('SELECT * FROM recordatorios_cliente WHERE cliente_cuenta_id=$1 ORDER BY fecha ASC', [req.session.clienteId]);
    res.json(resultado.rows);
  } catch (error) {
    console.error('GET /api/cuenta/recordatorios:', error);
    res.status(500).json({ error: 'No se pudieron cargar tus recordatorios.' });
  }
});

app.post('/api/cuenta/recordatorios', requireClienteAuth, async (req, res) => {
  const { titulo, fecha, repetirAnual, notas } = req.body || {};
  if (!titulo?.trim() || !fecha) return res.status(400).json({ error: 'Título y fecha son obligatorios.' });
  try {
    const resultado = await pool.query(
      `INSERT INTO recordatorios_cliente (cliente_cuenta_id, titulo, fecha, repetir_anual, notas) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.session.clienteId, titulo.trim(), fecha, repetirAnual !== false, notas?.trim() || null]
    );
    res.status(201).json(resultado.rows[0]);
  } catch (error) {
    console.error('POST /api/cuenta/recordatorios:', error);
    res.status(500).json({ error: 'No se pudo guardar el recordatorio.' });
  }
});

app.delete('/api/cuenta/recordatorios/:id', requireClienteAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido.' });
  try {
    const resultado = await pool.query('DELETE FROM recordatorios_cliente WHERE id=$1 AND cliente_cuenta_id=$2', [id, req.session.clienteId]);
    if (resultado.rowCount === 0) return res.status(404).json({ error: 'Recordatorio no encontrado.' });
    res.json({ exito: true });
  } catch (error) {
    console.error('DELETE /api/cuenta/recordatorios/:id:', error);
    res.status(500).json({ error: 'No se pudo eliminar el recordatorio.' });
  }
});

// ---------------------------------------------------------------------------
// Programa de puntos -- se calcula en vivo a partir de pedidos ENTREGADOS
// (1 punto por cada $1 MXN gastado en productos, sin contar el envío). No hay
// una tabla de puntos que se pueda desincronizar: siempre refleja tus pedidos reales.
// ---------------------------------------------------------------------------
const META_PUNTOS = 3000;
// Cuántos pesos de descuento vale cada punto al canjearlo por un cupón.
const VALOR_PUNTO_EN_PESOS = 0.1; // 3000 puntos = $300 MXN de descuento

app.get('/api/cuenta/puntos', requireClienteAuth, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT id, creado_en, total, envio FROM ordenes WHERE cliente_cuenta_id=$1 AND estado='Entregado' ORDER BY creado_en ASC`,
      [req.session.clienteId]
    );
    const historial = resultado.rows.map(o => ({
      orden_id: o.id,
      fecha: o.creado_en,
      puntos: Math.max(0, Math.round(Number(o.total) - Number(o.envio || 0)))
    }));
    const totalGanado = historial.reduce((s, h) => s + h.puntos, 0);
    const clienteRes = await pool.query('SELECT puntos_canjeados FROM clientes_cuenta WHERE id=$1', [req.session.clienteId]);
    const puntosCanjeados = clienteRes.rows[0]?.puntos_canjeados || 0;
    const totalPuntos = Math.max(0, totalGanado - puntosCanjeados);
    res.json({
      puntos: totalPuntos % META_PUNTOS,
      puntosTotales: totalPuntos,
      meta: META_PUNTOS,
      cuponesDisponibles: Math.floor(totalPuntos / META_PUNTOS),
      valorPuntoEnPesos: VALOR_PUNTO_EN_PESOS,
      historial
    });
  } catch (error) {
    console.error('GET /api/cuenta/puntos:', error);
    res.status(500).json({ error: 'No se pudo cargar tu programa de puntos.' });
  }
});

// Canjea META_PUNTOS puntos por un cupón de descuento de un solo uso, propio
// de esta cuenta. No se guarda un "saldo" de puntos aparte -- se recalculan
// siempre desde el historial de pedidos Entregados, restando lo ya canjeado.
app.post('/api/cuenta/puntos/canjear', requireClienteAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ordenesRes = await client.query(
      `SELECT total, envio FROM ordenes WHERE cliente_cuenta_id=$1 AND estado='Entregado'`,
      [req.session.clienteId]
    );
    const totalGanado = ordenesRes.rows.reduce((s, o) => s + Math.max(0, Math.round(Number(o.total) - Number(o.envio || 0))), 0);

    const clienteRes = await client.query('SELECT puntos_canjeados FROM clientes_cuenta WHERE id=$1 FOR UPDATE', [req.session.clienteId]);
    const puntosCanjeados = clienteRes.rows[0]?.puntos_canjeados || 0;
    const disponibles = Math.max(0, totalGanado - puntosCanjeados);

    if (disponibles < META_PUNTOS) {
      throw Object.assign(new Error(`Todavía te faltan puntos para canjear (necesitas ${META_PUNTOS}, tienes ${disponibles}).`), { statusCode: 400 });
    }

    const valorCupon = Math.round(META_PUNTOS * VALOR_PUNTO_EN_PESOS);
    const codigo = `PUNTOS-${req.session.clienteId}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    await client.query(
      `INSERT INTO cupones (codigo, tipo, valor, activo, usos_maximos, cliente_cuenta_id)
       VALUES ($1, 'monto_fijo', $2, true, 1, $3)`,
      [codigo, valorCupon, req.session.clienteId]
    );
    await client.query('UPDATE clientes_cuenta SET puntos_canjeados = puntos_canjeados + $1 WHERE id=$2', [META_PUNTOS, req.session.clienteId]);

    await client.query('COMMIT');
    res.status(201).json({ exito: true, codigo, valor: valorCupon });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('POST /api/cuenta/puntos/canjear:', error);
    res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'No se pudo canjear tus puntos.' });
  } finally {
    client.release();
  }
});

// Cupones propios de la cuenta que todavía se pueden usar (los que salieron
// de canjear puntos, o cualquier otro que se le haya asignado a esa cuenta).
app.get('/api/cuenta/cupones', requireClienteAuth, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT codigo, tipo, valor, fecha_expiracion FROM cupones
       WHERE cliente_cuenta_id=$1 AND activo=true AND (usos_maximos IS NULL OR usos_actuales < usos_maximos)
       ORDER BY creado_en DESC`,
      [req.session.clienteId]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('GET /api/cuenta/cupones:', error);
    res.status(500).json({ error: 'No se pudieron cargar tus cupones.' });
  }
});

// El carrito de quien tiene cuenta se guarda también del lado del servidor,
// no solo en su navegador -- así, si arma su pedido en el celular y luego
// abre la laptop para pagar más cómodo, su carrito lo sigue esperando ahí.
app.get('/api/cuenta/carrito', requireClienteAuth, limitadorGeneral, async (req, res) => {
  try {
    const resultado = await pool.query('SELECT carrito_guardado, carrito_actualizado_en FROM clientes_cuenta WHERE id=$1', [req.session.clienteId]);
    res.json({
      carrito: Array.isArray(resultado.rows[0]?.carrito_guardado) ? resultado.rows[0].carrito_guardado : [],
      actualizadoEn: resultado.rows[0]?.carrito_actualizado_en || null
    });
  } catch (error) {
    console.error('GET /api/cuenta/carrito:', error);
    res.status(500).json({ error: 'No se pudo cargar tu carrito guardado.' });
  }
});

app.put('/api/cuenta/carrito', requireClienteAuth, limitadorGeneral, async (req, res) => {
  const carrito = Array.isArray(req.body?.carrito) ? req.body.carrito : [];
  if (carrito.length > 200) {
    return res.status(400).json({ error: 'El carrito tiene demasiados artículos.' });
  }
  try {
    await pool.query(
      'UPDATE clientes_cuenta SET carrito_guardado=$1, carrito_actualizado_en=NOW() WHERE id=$2',
      [JSON.stringify(carrito), req.session.clienteId]
    );
    res.json({ exito: true });
  } catch (error) {
    console.error('PUT /api/cuenta/carrito:', error);
    res.status(500).json({ error: 'No se pudo guardar tu carrito.' });
  }
});


app.get('/api/admin/usuarios', requireAuth, requireAdmin, async (req, res) => {
  try {
    const resultado = await pool.query('SELECT * FROM usuarios_admin ORDER BY id ASC');
    res.json(resultado.rows.map(usuarioPublico));
  } catch (error) {
    console.error('GET /api/admin/usuarios:', error);
    res.status(500).json({ error: 'Error al cargar el equipo.' });
  }
});

app.post('/api/admin/usuarios', requireAuth, requireAdmin, async (req, res) => {
  const { nombre, email, password, rol } = req.body || {};
  if (!nombre?.trim() || !email?.trim() || !password || password.length < 8) {
    return res.status(400).json({ error: 'Nombre, correo y una contraseña de al menos 8 caracteres son obligatorios.' });
  }
  const rolFinal = rol === 'admin' ? 'admin' : 'editor';
  try {
    const hash = await bcrypt.hash(password, 12);
    const resultado = await pool.query(
      `INSERT INTO usuarios_admin (nombre, email, password_hash, rol) VALUES ($1,$2,$3,$4) RETURNING *`,
      [nombre.trim(), email.trim().toLowerCase(), hash, rolFinal]
    );
    res.status(201).json(usuarioPublico(resultado.rows[0]));
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' });
    }
    console.error('POST /api/admin/usuarios:', error);
    res.status(500).json({ error: 'No se pudo crear el usuario.' });
  }
});

app.patch('/api/admin/usuarios/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido.' });

  const campos = [];
  const valores = [];
  let i = 1;

  if (typeof req.body.nombre === 'string' && req.body.nombre.trim()) { campos.push(`nombre=$${i++}`); valores.push(req.body.nombre.trim()); }
  if (req.body.rol === 'admin' || req.body.rol === 'editor') { campos.push(`rol=$${i++}`); valores.push(req.body.rol); }
  if (typeof req.body.activo === 'boolean') {
    if (id === req.session.usuarioId && req.body.activo === false) {
      return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta.' });
    }
    campos.push(`activo=$${i++}`); valores.push(req.body.activo);
  }
  if (typeof req.body.password === 'string' && req.body.password) {
    if (req.body.password.length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
    const hash = await bcrypt.hash(req.body.password, 12);
    campos.push(`password_hash=$${i++}`); valores.push(hash);
  }
  if (campos.length === 0) return res.status(400).json({ error: 'No hay cambios para guardar.' });

  valores.push(id);
  try {
    const resultado = await pool.query(`UPDATE usuarios_admin SET ${campos.join(', ')} WHERE id=$${i} RETURNING *`, valores);
    if (resultado.rowCount === 0) return res.status(404).json({ error: 'Usuario no encontrado.' });
    res.json(usuarioPublico(resultado.rows[0]));
  } catch (error) {
    console.error('PATCH /api/admin/usuarios/:id:', error);
    res.status(500).json({ error: 'No se pudo actualizar el usuario.' });
  }
});

app.delete('/api/admin/usuarios/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido.' });
  if (id === req.session.usuarioId) return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta.' });
  try {
    const admins = await pool.query(`SELECT COUNT(*)::int AS n FROM usuarios_admin WHERE rol='admin' AND activo=true`);
    const objetivo = await pool.query('SELECT * FROM usuarios_admin WHERE id=$1', [id]);
    if (objetivo.rowCount === 0) return res.status(404).json({ error: 'Usuario no encontrado.' });
    if (objetivo.rows[0].rol === 'admin' && objetivo.rows[0].activo && admins.rows[0].n <= 1) {
      return res.status(400).json({ error: 'Debe quedar al menos un administrador activo.' });
    }
    await pool.query('DELETE FROM usuarios_admin WHERE id=$1', [id]);
    res.json({ exito: true });
  } catch (error) {
    console.error('DELETE /api/admin/usuarios/:id:', error);
    res.status(500).json({ error: 'No se pudo eliminar el usuario.' });
  }
});

function productoValido(body) {
  const precio = Number(body.precio);
  return Boolean(body.nombre?.trim()) && Number.isFinite(precio) && precio >= 0;
}

function normalizarProducto(body) {
  const stockNum = Number(body.stock);
  return {
    nombre: String(body.nombre || '').trim(),
    descripcion: String(body.descripcion || '').trim() || null,
    especificaciones: String(body.especificaciones || '').trim() || null,
    precio: Number(body.precio),
    imagen_url: String(body.imagen_url || '').trim() || null,
    imagenes: String(body.imagenes || '').trim() || null,
    categoria: String(body.categoria || '').trim() || null,
    subcategoria: String(body.subcategoria || '').trim() || null,
    subsubcategoria: String(body.subsubcategoria || '').trim() || null,
    variante_personalizada: String(body.variante_personalizada || '').trim() || null,
    tamanos: String(body.tamanos || '').trim() || null,
    cobertura: String(body.cobertura || '').trim() || null,
    stock: Number.isFinite(stockNum) && stockNum >= 0 ? Math.floor(stockNum) : 1,
    disponible: body.disponible === undefined ? true : Boolean(body.disponible),
    tiempo_entrega_dias: Number.isFinite(Number(body.tiempo_entrega_dias)) && Number(body.tiempo_entrega_dias) >= 0 ? Math.floor(Number(body.tiempo_entrega_dias)) : 0
  };
}

// Salud del servidor / conexión.
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (error) {
    console.error('Health check:', error.message);
    res.status(503).json({ ok: false });
  }
});

// API: Obtener catálogo disponible (pública, la usa la tienda).
// Agrega a cada producto su lista de clasificaciones (categoría/subcategoría/
// tipo) -- puede tener varias a la vez -- y, si es un combo, sus componentes.
async function adjuntarClasificaciones(productos) {
  if (productos.length === 0) return productos;
  const ids = productos.map(p => p.id);
  const clasifRows = (await pool.query('SELECT * FROM producto_categorias WHERE producto_id = ANY($1)', [ids])).rows;
  const comboRows = (await pool.query(`
    SELECT pci.producto_id, pci.cantidad, a.id AS componente_id, a.nombre, a.precio, a.imagen_url, a.disponible, a.stock
    FROM producto_combo_items pci JOIN arreglos_florales a ON a.id = pci.componente_id
    WHERE pci.producto_id = ANY($1)
  `, [ids])).rows;
  const clasifPorProducto = {}; const comboPorProducto = {};
  clasifRows.forEach(c => { (clasifPorProducto[c.producto_id] ||= []).push({ categoria: c.categoria, subcategoria: c.subcategoria, subsubcategoria: c.subsubcategoria }); });
  comboRows.forEach(c => { (comboPorProducto[c.producto_id] ||= []).push({ id: c.componente_id, nombre: c.nombre, precio: c.precio, imagen_url: c.imagen_url, cantidad: c.cantidad, disponible: c.disponible !== false, stock: c.stock }); });
  return productos.map(p => ({
    ...p,
    clasificaciones: clasifPorProducto[p.id] || (p.categoria ? [{ categoria: p.categoria, subcategoria: p.subcategoria, subsubcategoria: p.subsubcategoria }] : []),
    combo_items: comboPorProducto[p.id] || []
  }));
}

// Reemplaza las clasificaciones de un producto por la lista dada. La
// primera también se guarda en las columnas categoria/subcategoria/
// subsubcategoria de siempre, para no romper nada que todavía las lea
// directo (tarjetas, filtros simples, etc.).
async function sincronizarClasificacionesProducto(productoId, clasificaciones) {
  const lista = (Array.isArray(clasificaciones) ? clasificaciones : [])
    .map(c => ({ categoria: String(c.categoria || '').trim(), subcategoria: String(c.subcategoria || '').trim() || null, subsubcategoria: String(c.subsubcategoria || '').trim() || null }))
    .filter(c => c.categoria);
  await pool.query('DELETE FROM producto_categorias WHERE producto_id = $1', [productoId]);
  for (const c of lista) {
    await pool.query('INSERT INTO producto_categorias (producto_id, categoria, subcategoria, subsubcategoria) VALUES ($1,$2,$3,$4)', [productoId, c.categoria, c.subcategoria, c.subsubcategoria]);
  }
  return lista[0] || { categoria: null, subcategoria: null, subsubcategoria: null };
}

async function sincronizarComboProducto(productoId, comboItems) {
  const lista = (Array.isArray(comboItems) ? comboItems : [])
    .map(c => ({ componente_id: Number(c.id || c.componente_id), cantidad: Math.max(1, Number(c.cantidad) || 1) }))
    .filter(c => Number.isInteger(c.componente_id) && c.componente_id > 0);
  await pool.query('DELETE FROM producto_combo_items WHERE producto_id = $1', [productoId]);
  for (const c of lista) {
    await pool.query('INSERT INTO producto_combo_items (producto_id, componente_id, cantidad) VALUES ($1,$2,$3)', [productoId, c.componente_id, c.cantidad]);
  }
}

app.get('/api/catalogo', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM arreglos_florales
      WHERE COALESCE(disponible, true) = true
      ORDER BY id DESC
    `);
    res.json(await adjuntarClasificaciones(result.rows));
  } catch (error) {
    console.error('GET /api/catalogo:', error);
    res.status(500).json({ error: 'Error del servidor al cargar el catálogo.' });
  }
});

// API: catálogo completo para el panel (incluye ocultos/agotados). Requiere sesión.
app.get('/api/admin/catalogo', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM arreglos_florales ORDER BY id DESC');
    res.json(await adjuntarClasificaciones(result.rows));
  } catch (error) {
    console.error('GET /api/admin/catalogo:', error);
    res.status(500).json({ error: 'Error del servidor al cargar el catálogo.' });
  }
});

// API: Obtener un producto por ID.
app.get('/api/catalogo/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'ID de producto inválido.' });
  }
  try {
    const result = await pool.query('SELECT * FROM arreglos_florales WHERE id = $1 AND COALESCE(disponible, true) = true', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Producto no encontrado.' });
    const [conClasificaciones] = await adjuntarClasificaciones(result.rows);
    res.json(conClasificaciones);
  } catch (error) {
    console.error('GET /api/catalogo/:id:', error);
    res.status(500).json({ error: 'Error del servidor al cargar el producto.' });
  }
});

// "También te puede interesar" en la vista de producto -- otros productos
// que comparten al menos una categoría con este, para no dejar la vista de
// producto como un callejón sin salida.
app.get('/api/catalogo/:id/relacionados', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'ID de producto inválido.' });
  }
  try {
    const categoriasProducto = await pool.query(`
      SELECT DISTINCT categoria FROM producto_categorias WHERE producto_id = $1
      UNION SELECT categoria FROM arreglos_florales WHERE id = $1 AND categoria IS NOT NULL
    `, [id]);
    const categorias = categoriasProducto.rows.map(r => r.categoria);
    if (categorias.length === 0) return res.json([]);

    const resultado = await pool.query(`
      SELECT DISTINCT a.* FROM arreglos_florales a
      LEFT JOIN producto_categorias pc ON pc.producto_id = a.id
      WHERE a.id != $1 AND COALESCE(a.disponible, true) = true
        AND (pc.categoria = ANY($2::text[]) OR a.categoria = ANY($2::text[]))
      ORDER BY a.id DESC
      LIMIT 8
    `, [id, categorias]);
    // De los que sí comparten categoría, se muestran hasta 6 al azar (para
    // que no salgan siempre los mismos en cada visita).
    const mezclados = resultado.rows.sort(() => Math.random() - 0.5).slice(0, 6);
    res.json(await adjuntarClasificaciones(mezclados));
  } catch (error) {
    console.error('GET /api/catalogo/:id/relacionados:', error);
    res.status(500).json({ error: 'No se pudieron cargar productos relacionados.' });
  }
});

// Pedir que le avisen cuando un producto agotado (o desactivado) vuelva a
// estar disponible -- se limita a 1 por correo y producto (si ya se había
// suscrito, no truena, solo confirma de nuevo).
app.post('/api/catalogo/:id/avisarme', limitadorGeneral, async (req, res) => {
  const id = Number(req.params.id);
  const { email } = req.body || {};
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID de producto inválido.' });
  if (!email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ error: 'Ingresa un correo electrónico válido.' });
  }
  try {
    await pool.query(
      `INSERT INTO avisos_restock (producto_id, email) VALUES ($1, $2)
       ON CONFLICT (producto_id, email) DO UPDATE SET avisado=false`,
      [id, email.trim().toLowerCase()]
    );
    res.json({ exito: true });
  } catch (error) {
    console.error('POST /api/catalogo/:id/avisarme:', error);
    res.status(500).json({ error: 'No se pudo guardar tu solicitud.' });
  }
});

app.post('/api/catalogo', requireAuth, async (req, res) => {
  if (!productoValido(req.body)) {
    return res.status(400).json({ error: 'Nombre y precio válido son obligatorios.' });
  }
  if (!Array.isArray(req.body.clasificaciones) || req.body.clasificaciones.filter(c => c?.categoria).length === 0) {
    return res.status(400).json({ error: 'Elige al menos una clasificación (categoría) para el producto.' });
  }

  const p = normalizarProducto(req.body);
  const primera = req.body.clasificaciones.find(c => c?.categoria) || {};
  try {
    const result = await pool.query(`
      INSERT INTO arreglos_florales
        (nombre, descripcion, especificaciones, precio, imagen_url, imagenes, categoria, subcategoria, subsubcategoria,
         variante_personalizada, tamanos, cobertura, stock, disponible, es_combo, tiempo_entrega_dias)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING *
    `, [p.nombre, p.descripcion, p.especificaciones, p.precio, p.imagen_url, p.imagenes, primera.categoria,
        primera.subcategoria || null, primera.subsubcategoria || null, p.variante_personalizada, p.tamanos, p.cobertura,
        p.stock, p.disponible, !!req.body.es_combo, p.tiempo_entrega_dias]);

    await sincronizarClasificacionesProducto(result.rows[0].id, req.body.clasificaciones);
    if (req.body.es_combo) await sincronizarComboProducto(result.rows[0].id, req.body.combo_items);
    await registrarBitacora(req, 'Creó un producto', result.rows[0].nombre);

    const [conClasificaciones] = await adjuntarClasificaciones([result.rows[0]]);
    res.status(201).json(conClasificaciones);
  } catch (error) {
    console.error('POST /api/catalogo:', error);
    res.status(500).json({ error: 'Error al insertar el producto.' });
  }
});

// API: Editar producto. Requiere sesión.
app.put('/api/catalogo/:id', requireAuth, async (req, res) => {
  if (!productoValido(req.body)) {
    return res.status(400).json({ error: 'Nombre y precio válido son obligatorios.' });
  }
  if (!Array.isArray(req.body.clasificaciones) || req.body.clasificaciones.filter(c => c?.categoria).length === 0) {
    return res.status(400).json({ error: 'Elige al menos una clasificación (categoría) para el producto.' });
  }

  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'ID de producto inválido.' });
  }

  const p = normalizarProducto(req.body);
  const primera = req.body.clasificaciones.find(c => c?.categoria) || {};
  try {
    // Para saber si el producto "volvió a estar disponible" (y avisarle a
    // quien lo esperaba), hace falta el estado de ANTES de esta edición --
    // RETURNING * del UPDATE solo da el de después.
    const antes = await pool.query('SELECT stock, disponible FROM arreglos_florales WHERE id=$1', [id]);
    const estabaAgotado = antes.rows[0] && (antes.rows[0].disponible === false || Number(antes.rows[0].stock) <= 0);

    const result = await pool.query(`
      UPDATE arreglos_florales
      SET nombre=$1, descripcion=$2, especificaciones=$3, precio=$4, imagen_url=$5, imagenes=$6,
          categoria=$7, subcategoria=$8, subsubcategoria=$9, variante_personalizada=$10,
          tamanos=$11, cobertura=$12, stock=$13, disponible=$14, es_combo=$15, tiempo_entrega_dias=$16
      WHERE id=$17
      RETURNING *
    `, [p.nombre, p.descripcion, p.especificaciones, p.precio, p.imagen_url, p.imagenes, primera.categoria,
        primera.subcategoria || null, primera.subsubcategoria || null, p.variante_personalizada, p.tamanos,
        p.cobertura, p.stock, p.disponible, !!req.body.es_combo, p.tiempo_entrega_dias, id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }

    const yaHayDeNuevo = p.disponible !== false && Number(p.stock) > 0;
    if (estabaAgotado && yaHayDeNuevo) avisarRestockRF(id, result.rows[0].nombre);

    await sincronizarClasificacionesProducto(id, req.body.clasificaciones);
    if (req.body.es_combo) await sincronizarComboProducto(id, req.body.combo_items);
    else await pool.query('DELETE FROM producto_combo_items WHERE producto_id = $1', [id]);
    await registrarBitacora(req, 'Editó un producto', result.rows[0].nombre);

    const [conClasificaciones] = await adjuntarClasificaciones([result.rows[0]]);
    res.json(conClasificaciones);
  } catch (error) {
    console.error('PUT /api/catalogo/:id:', error);
    res.status(500).json({ error: 'Error al actualizar el producto.' });
  }
});

// API: Eliminar producto. Requiere sesión.
app.delete('/api/catalogo/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'ID de producto inválido.' });
  }

  try {
    // Si este producto es componente de algún combo, borrarlo lo dejaría
    // incompleto sin que nadie se diera cuenta -- se avisa primero, y solo
    // se elimina de una vez si el propio panel confirma que sí quiere.
    if (req.query.forzar !== 'true') {
      const combosQueLoUsan = await pool.query(`
        SELECT DISTINCT a.nombre FROM producto_combo_items pci
        JOIN arreglos_florales a ON a.id = pci.producto_id
        WHERE pci.componente_id = $1
      `, [id]);
      if (combosQueLoUsan.rowCount > 0) {
        const nombres = combosQueLoUsan.rows.map(r => r.nombre);
        return res.status(409).json({
          error: `Este producto es parte de ${nombres.length === 1 ? 'este combo' : 'estos combos'}: ${nombres.join(', ')}. Si lo eliminas, ${nombres.length === 1 ? 'ese combo' : 'esos combos'} se quedará${nombres.length === 1 ? '' : 'n'} incompleto${nombres.length === 1 ? '' : 's'}.`,
          requiereConfirmacion: true
        });
      }
    }

    const result = await pool.query('DELETE FROM arreglos_florales WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }
    await registrarBitacora(req, 'Eliminó un producto', `ID ${id}`);
    res.json({ exito: true });
  } catch (error) {
    console.error('DELETE /api/catalogo/:id:', error);
    res.status(500).json({ error: 'Error al eliminar el producto.' });
  }
});

// API: Subir imagen (para el formulario del panel). Requiere sesión.
app.post('/api/admin/subir-imagen', requireAuth, (req, res) => {
  subirImagen.single('imagen')(req, res, (error) => {
    if (error) {
      return res.status(400).json({ error: error.message || 'No se pudo subir la imagen.' });
    }
    if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo.' });
    res.status(201).json({ url: `/uploads/${req.file.filename}` });
  });
});

// API: Crear pedido.
// El total se calcula en el servidor usando los precios de PostgreSQL.
const ENVIO_FIJO = 80;

// ---------------------------------------------------------------------------
// Correos transaccionales (Resend) -- confirmación de pedido y de pago.
// Variables de entorno necesarias:
//   RESEND_API_KEY  -- del panel de Resend (API Keys)
//   RESEND_FROM     -- remitente, ej. "Reserva Floral <hey@reservafloral.com>"
//                      (el dominio debe estar verificado en Resend)
// Mientras no estén configuradas, el sitio sigue funcionando igual -- nunca
// se bloquea una venta por no poder mandar un correo.
// ---------------------------------------------------------------------------
const resendClient = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const CORREO_REMITENTE = process.env.RESEND_FROM || 'Reserva Floral <hey@reservafloral.com>';

function formatearFechaCorreo(fecha) {
  if (!fecha) return '';
  const d = new Date(fecha + (String(fecha).length === 10 ? 'T00:00:00' : ''));
  return d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
}

async function plantillaBaseCorreo(tituloInterno, cuerpoHtml) {
  const logoUrl = `${URL_SITIO}/logo-reserva-floral.png`;
  let whatsappBoton = '';
  try {
    const cfg = await pool.query("SELECT clave, valor FROM configuracion WHERE clave = 'whatsapp_numero'");
    const numero = String(cfg.rows[0]?.valor || '').replace(/\D/g, '');
    if (numero) {
      whatsappBoton = `
        <tr><td align="center" style="padding-top:18px;">
          <a href="https://wa.me/${numero}" style="display:inline-block;background:#ffffff;color:#c2185b;text-decoration:none;font-size:12px;font-weight:600;padding:9px 18px;border-radius:999px;">¿Dudas? Escríbenos por WhatsApp</a>
        </td></tr>`;
    }
  } catch (error) {
    console.error('No se pudo cargar el número de WhatsApp para el correo:', error?.message || error);
  }
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7eef2;padding:32px 16px;font-family:'Helvetica Neue',Arial,sans-serif;">
      <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;">
          <tr><td style="background:#ffffff;border-radius:20px 20px 0 0;padding:30px 24px 18px;text-align:center;">
            <img src="${logoUrl}" alt="Reserva Floral" style="height:46px;width:auto;">
          </td></tr>
          <tr><td style="background:#ffffff;padding:6px 32px 32px;color:#3a3a3a;line-height:1.55;">
            ${cuerpoHtml}
          </td></tr>
          <tr><td style="background:#c2185b;border-radius:0 0 20px 20px;padding:20px 24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${whatsappBoton}
            </table>
          </td></tr>
        </table>
        <p style="text-align:center;color:#b58f9c;font-size:11px;margin:16px 0 0;">© ${new Date().getFullYear()} Reserva Floral · reservafloral.com</p>
      </td></tr>
    </table>
  `;
}

// Permite apagar cualquiera de los 4 correos automáticos desde el panel
// (Configuración → Correos automáticos) sin tocar código -- por defecto,
// si nunca se ha guardado nada, todos están activos.
async function correoTipoActivoRF(clave) {
  try {
    const resultado = await pool.query('SELECT valor FROM configuracion WHERE clave = $1', [clave]);
    return resultado.rows[0]?.valor !== 'false';
  } catch (error) {
    console.error(`No se pudo revisar si "${clave}" está activo, se manda por default:`, error?.message || error);
    return true;
  }
}

// Cada una de estas arma el asunto y el cuerpo de un correo a partir de los
// datos de un pedido -- las usa tanto el envío real como la vista previa del
// panel, para que lo que se vea ahí sea EXACTAMENTE lo que le llega al
// cliente, nunca una copia aparte que se pueda desactualizar.
function construirCorreoConfirmacion(orden) {
  const items = Array.isArray(orden.carrito) ? orden.carrito : JSON.parse(orden.carrito || '[]');
  const filas = items.map(it => `
    <tr>
      <td style="padding:6px 0;border-bottom:1px solid #f0f0f0;font-size:13px;">${it.nombre}${it.variante ? ` (${it.variante})` : ''} × ${it.cantidad}</td>
      <td style="padding:6px 0;border-bottom:1px solid #f0f0f0;font-size:13px;text-align:right;">$${(it.precio * it.cantidad).toFixed(2)}</td>
    </tr>`).join('');
  const cuerpo = `
    <h2 style="font-size:16px;margin:0 0 8px;">¡Gracias por tu pedido, ${orden.cliente_nombre}!</h2>
    <p style="font-size:13px;color:#666;margin:0 0 16px;">Tu pedido <strong>#${orden.id}</strong> fue registrado correctamente.</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">${filas}</table>
    <p style="font-size:13px;margin:4px 0;"><strong>Total:</strong> $${Number(orden.total).toFixed(2)} MXN</p>
    <p style="font-size:13px;margin:4px 0;"><strong>Entrega:</strong> ${formatearFechaCorreo(orden.fecha_entrega)}${orden.horario_entrega ? ` · ${orden.horario_entrega}` : ''}</p>
    <p style="font-size:13px;margin:4px 0;"><strong>Dirección:</strong> ${orden.direccion_entrega}</p>
  `;
  return { titulo: 'Confirmación de pedido', asunto: `Recibimos tu pedido #${orden.id} — Reserva Floral`, cuerpo };
}

function construirCorreoPagoConfirmado(orden) {
  const cuerpo = `
    <h2 style="font-size:16px;margin:0 0 8px;">✓ Tu pago fue confirmado</h2>
    <p style="font-size:13px;color:#666;margin:0 0 16px;">El pago de tu pedido <strong>#${orden.id}</strong> ya se acreditó. Empezaremos a prepararlo para la entrega.</p>
    <p style="font-size:13px;margin:4px 0;"><strong>Total pagado:</strong> $${Number(orden.total).toFixed(2)} MXN</p>
    <p style="font-size:13px;margin:4px 0;"><strong>Entrega:</strong> ${formatearFechaCorreo(orden.fecha_entrega)}${orden.horario_entrega ? ` · ${orden.horario_entrega}` : ''}</p>
  `;
  return { titulo: 'Pago confirmado', asunto: `Tu pago fue confirmado — Pedido #${orden.id}`, cuerpo };
}

// Le avisa al cliente cuando el negocio cambia el estado de su pedido (ej. a
// "En camino" o "Entregado") -- antes, cambiar el estado desde el panel no
// le llegaba absolutamente nada al cliente.
const MENSAJES_ESTADO_CORREO = {
  'En preparación': { asunto: 'Ya estamos preparando tu pedido', titulo: '🌸 Tu pedido está en preparación', texto: 'Nuestro equipo ya está armando tu pedido con mucho cuidado.' },
  'En camino': { asunto: '¡Tu pedido va en camino!', titulo: '🚚 Tu pedido va en camino', texto: 'Tu pedido salió y está en camino a la dirección de entrega.' },
  'Entregado': { asunto: 'Tu pedido fue entregado', titulo: '✓ Tu pedido fue entregado', texto: 'Confirmamos que tu pedido ya fue entregado. ¡Gracias por tu compra!' },
  'Cancelado': { asunto: 'Tu pedido fue cancelado', titulo: 'Tu pedido fue cancelado', texto: 'Tu pedido fue cancelado. Si tienes dudas, contáctanos y con gusto te ayudamos.' }
};
function construirCorreoEstadoActualizado(orden, estadoNuevo) {
  const mensaje = MENSAJES_ESTADO_CORREO[estadoNuevo] || MENSAJES_ESTADO_CORREO['En preparación'];
  const cuerpo = `
    <h2 style="font-size:16px;margin:0 0 8px;">${mensaje.titulo}</h2>
    <p style="font-size:13px;color:#666;margin:0 0 16px;">${mensaje.texto}</p>
    <p style="font-size:13px;margin:4px 0;"><strong>Pedido:</strong> #${orden.id}</p>
    <p style="font-size:13px;margin:4px 0;"><strong>Entrega:</strong> ${formatearFechaCorreo(orden.fecha_entrega)}${orden.horario_entrega ? ` · ${orden.horario_entrega}` : ''}</p>
    <p style="font-size:13px;margin:4px 0;"><strong>Dirección:</strong> ${orden.direccion_entrega || ''}</p>
  `;
  return { titulo: mensaje.titulo, asunto: `${mensaje.asunto} — Pedido #${orden.id}`, cuerpo };
}

function construirCorreoCarritoAbandonado(carritoAbandonado) {
  const items = Array.isArray(carritoAbandonado.items) ? carritoAbandonado.items : JSON.parse(carritoAbandonado.items || '[]');
  const listaHtml = items.map(it => `
    <p style="font-size:13px;margin:4px 0;">${Number(it.cantidad) || 1} × ${it.nombre || 'Producto'} — $${Number(it.precio || 0).toFixed(2)}</p>
  `).join('');
  const cuerpo = `
    <h2 style="font-size:16px;margin:0 0 8px;">🌸 Se te quedó algo en el carrito</h2>
    <p style="font-size:13px;color:#666;margin:0 0 16px;">${carritoAbandonado.nombre ? `Hola ${carritoAbandonado.nombre}, v` : 'V'}imos que dejaste estos productos listos, pero no llegaste a terminar tu compra. Aquí siguen esperándote:</p>
    ${listaHtml}
    <p style="font-size:13px;margin:16px 0 4px;"><strong>Total: $${Number(carritoAbandonado.total || 0).toFixed(2)} MXN</strong></p>
    <p style="margin-top:20px;"><a href="${URL_SITIO}/carrito" style="background:#c2185b;color:#fff;padding:10px 20px;border-radius:999px;text-decoration:none;font-size:13px;">Terminar mi compra</a></p>
  `;
  return { titulo: 'Tu carrito te espera', asunto: 'Se te quedó algo en el carrito 🌸', cuerpo };
}

async function enviarCorreoConfirmacionPedido(orden) {
  if (!resendClient || !orden.email_contacto || !(await correoTipoActivoRF('correo_confirmacion_activo'))) return;
  try {
    const { titulo, asunto, cuerpo } = construirCorreoConfirmacion(orden);
    await resendClient.emails.send({
      from: CORREO_REMITENTE,
      to: orden.email_contacto,
      subject: asunto,
      html: await plantillaBaseCorreo(titulo, cuerpo)
    });
  } catch (error) {
    // Un correo que falla nunca debe tumbar la venta -- solo se registra.
    console.error('No se pudo enviar el correo de confirmación de pedido:', error?.message || error);
  }
}

async function enviarCorreoPagoConfirmado(orden) {
  if (!resendClient || !orden.email_contacto || !(await correoTipoActivoRF('correo_pago_confirmado_activo'))) return;
  try {
    const { titulo, asunto, cuerpo } = construirCorreoPagoConfirmado(orden);
    await resendClient.emails.send({
      from: CORREO_REMITENTE,
      to: orden.email_contacto,
      subject: asunto,
      html: await plantillaBaseCorreo(titulo, cuerpo)
    });
  } catch (error) {
    console.error('No se pudo enviar el correo de pago confirmado:', error?.message || error);
  }
}

async function enviarCorreoEstadoActualizado(orden, estadoNuevo) {
  if (!MENSAJES_ESTADO_CORREO[estadoNuevo] || !resendClient || !orden.email_contacto || !(await correoTipoActivoRF('correo_estado_actualizado_activo'))) return;
  try {
    const { titulo, asunto, cuerpo } = construirCorreoEstadoActualizado(orden, estadoNuevo);
    await resendClient.emails.send({
      from: CORREO_REMITENTE,
      to: orden.email_contacto,
      subject: asunto,
      html: await plantillaBaseCorreo(titulo, cuerpo)
    });
  } catch (error) {
    console.error('No se pudo enviar el correo de estado actualizado:', error?.message || error);
  }
}

// Recordatorio para quien dejó su carrito a medias (ya escribió su correo en
// el checkout, pero nunca terminó de pagar).
async function enviarCorreoCarritoAbandonado(carritoAbandonado) {
  if (!resendClient || !(await correoTipoActivoRF('correo_carrito_abandonado_activo'))) return;
  try {
    const { titulo, asunto, cuerpo } = construirCorreoCarritoAbandonado(carritoAbandonado);
    await resendClient.emails.send({
      from: CORREO_REMITENTE,
      to: carritoAbandonado.email,
      subject: asunto,
      html: await plantillaBaseCorreo(titulo, cuerpo)
    });
  } catch (error) {
    console.error('No se pudo enviar el correo de carrito abandonado:', error?.message || error);
  }
}

// Le avisa a quien pidió que le avisaran cuando este producto volviera a
// estar disponible -- una sola vez por persona (se marca "avisado" para no
// mandarle el mismo correo de nuevo si el stock sube y baja varias veces).
async function avisarRestockRF(productoId, nombreProducto) {
  if (!resendClient) return;
  try {
    const espera = await pool.query('SELECT id, email FROM avisos_restock WHERE producto_id=$1 AND avisado=false', [productoId]);
    if (espera.rows.length === 0) return;
    const cuerpo = `
      <h2 style="font-size:16px;margin:0 0 8px;">🌸 ¡Ya volvió a haber!</h2>
      <p style="font-size:13px;color:#666;">"${nombreProducto}" ya está disponible de nuevo -- por si todavía te interesa, aquí tienes el enlace directo antes de que se vuelva a agotar.</p>
      <p style="margin-top:16px;"><a href="${URL_SITIO}/producto/${productoId}" style="background:#c2185b;color:#fff;padding:10px 20px;border-radius:999px;text-decoration:none;font-size:13px;">Ver el producto</a></p>
    `;
    const html = await plantillaBaseCorreo('Ya volvió a haber', cuerpo);
    await Promise.all(espera.rows.map(a => resendClient.emails.send({
      from: CORREO_REMITENTE, to: a.email, subject: `Ya volvió a haber: ${nombreProducto} 🌸`, html
    }).catch(err => console.error('No se pudo avisar restock a', a.email, err?.message || err))));
    await pool.query('UPDATE avisos_restock SET avisado=true WHERE producto_id=$1 AND avisado=false', [productoId]);
  } catch (error) {
    console.error('No se pudo procesar los avisos de restock:', error?.message || error);
  }
}

// Cada cierto tiempo revisa si hay carritos abandonados hace más de 2 horas
// a los que todavía no se les ha mandado el recordatorio, y se los manda --
// una sola vez por carrito.
async function revisarCarritosAbandonadosRF() {
  try {
    const resultado = await pool.query(`
      SELECT * FROM carritos_abandonados
      WHERE recuperado = false AND correo_enviado = false
        AND creado_en < NOW() - INTERVAL '2 hours'
    `);
    for (const carrito of resultado.rows) {
      await enviarCorreoCarritoAbandonado(carrito);
      await pool.query('UPDATE carritos_abandonados SET correo_enviado = true WHERE id = $1', [carrito.id]);
    }
  } catch (error) {
    console.error('No se pudo revisar carritos abandonados:', error?.message || error);
  }
}

// Valida un código de cupón contra el subtotal actual del carrito, sin
// necesidad de crear el pedido todavía -- para mostrar el descuento en el
// checkout antes de completar la compra. La validación de verdad (la que
// realmente cuenta) se repite dentro de POST /api/ordenes.
app.post('/api/cupones/validar', limitadorPedidos, async (req, res) => {
  const { codigo, subtotal } = req.body;
  const subtotalNum = Number(subtotal);
  if (!codigo?.trim() || !Number.isFinite(subtotalNum) || subtotalNum <= 0) {
    return res.status(400).json({ error: 'Faltan datos para validar el cupón.' });
  }
  try {
    const clienteIdSesion = req.session && req.session.clienteId ? req.session.clienteId : null;
    const resultado = await pool.query('SELECT * FROM cupones WHERE UPPER(codigo)=UPPER($1)', [codigo.trim()]);
    const cupon = resultado.rows[0];
    if (!cupon) return res.status(404).json({ error: 'El cupón no existe.' });
    if (!cupon.activo) return res.status(400).json({ error: 'Este cupón ya no está activo.' });
    if (cupon.fecha_inicio && new Date(cupon.fecha_inicio) > new Date()) return res.status(400).json({ error: 'Este cupón todavía no está disponible.' });
    if (cupon.fecha_expiracion && new Date(cupon.fecha_expiracion) < new Date()) return res.status(400).json({ error: 'Este cupón ya venció.' });
    if (cupon.usos_maximos !== null && cupon.usos_actuales >= cupon.usos_maximos) return res.status(400).json({ error: 'Este cupón ya alcanzó su límite de usos.' });
    if (Number(cupon.monto_minimo) > subtotalNum) return res.status(400).json({ error: `Este cupón requiere una compra mínima de $${Number(cupon.monto_minimo).toFixed(2)}.` });
    if (cupon.cliente_cuenta_id && cupon.cliente_cuenta_id !== clienteIdSesion) return res.status(400).json({ error: 'Este cupón no está disponible para tu cuenta.' });

    let descuento = cupon.tipo === 'porcentaje' ? subtotalNum * (Number(cupon.valor) / 100) : Number(cupon.valor);
    descuento = Math.min(descuento, subtotalNum);

    res.json({ valido: true, codigo: cupon.codigo, tipo: cupon.tipo, valor: Number(cupon.valor), descuento });
  } catch (error) {
    console.error('POST /api/cupones/validar:', error);
    res.status(500).json({ error: 'No se pudo validar el cupón.' });
  }
});

// Revisa si lo que hay en el carrito sigue disponible y con stock suficiente
// -- antes esto solo se revisaba hasta el paso final de pagar, así que el
// cliente podía llenar todo el checkout y enterarse hasta el último clic.
app.post('/api/carrito/validar', limitadorGeneral, async (req, res) => {
  const carrito = Array.isArray(req.body?.carrito) ? req.body.carrito : [];
  if (carrito.length === 0) return res.json({ items: [] });
  try {
    const ids = [...new Set(carrito.map(item => Number(item.id)).filter(Number.isInteger))];
    const productos = await pool.query('SELECT id, nombre, disponible, stock, es_combo, tiempo_entrega_dias FROM arreglos_florales WHERE id = ANY($1::int[])', [ids]);
    const porId = new Map(productos.rows.map(p => [p.id, p]));

    const idsCombo = productos.rows.filter(p => p.es_combo).map(p => p.id);
    const comboItems = idsCombo.length ? (await pool.query(`
      SELECT pci.producto_id, pci.cantidad, a.id AS componente_id, a.nombre AS componente_nombre, a.disponible AS componente_disponible, a.stock AS componente_stock
      FROM producto_combo_items pci JOIN arreglos_florales a ON a.id = pci.componente_id
      WHERE pci.producto_id = ANY($1::int[])
    `, [idsCombo])).rows : [];

    const items = carrito.map(item => {
      const id = Number(item.id);
      const cantidad = Math.max(1, Math.floor(Number(item.cantidad)) || 1);
      const producto = porId.get(id);
      const tiempoEntregaDias = Number(producto?.tiempo_entrega_dias) || 0;
      if (!producto || producto.disponible === false) {
        return { id, disponible: false, motivo: 'Ya no está disponible.', tiempoEntregaDias };
      }
      if (producto.es_combo) {
        const piezas = comboItems.filter(c => c.producto_id === id);
        const faltante = piezas.find(c => c.componente_disponible === false || Number(c.componente_stock) < cantidad * c.cantidad);
        if (faltante) {
          return { id, disponible: false, motivo: `"${faltante.componente_nombre}" (parte de este combo) ya no está disponible o no alcanza.`, tiempoEntregaDias };
        }
        return { id, disponible: true, tiempoEntregaDias };
      }
      if (Number(producto.stock) < cantidad) {
        return { id, disponible: false, motivo: `Ya no hay suficiente existencia (quedan ${producto.stock}).`, stockActual: Number(producto.stock), tiempoEntregaDias };
      }
      return { id, disponible: true, tiempoEntregaDias };
    });

    res.json({ items });
  } catch (error) {
    console.error('POST /api/carrito/validar:', error);
    res.status(500).json({ error: 'No se pudo validar el carrito.' });
  }
});

// Guarda (o actualiza) una "foto" del carrito de alguien que ya escribió su
// correo en el checkout pero todavía no termina de pagar -- así, si lo deja
// a medias, se le puede mandar un recordatorio más tarde. Se llama sola
// desde el checkout, sin que el cliente note nada.
app.post('/api/carrito-temporal', limitadorGeneral, async (req, res) => {
  const { email, nombre, carrito, total } = req.body || {};
  if (!email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || !Array.isArray(carrito) || carrito.length === 0) {
    return res.status(400).json({ error: 'Datos incompletos.' });
  }
  try {
    await pool.query(`
      INSERT INTO carritos_abandonados (email, nombre, items, total, actualizado_en, correo_enviado, recuperado)
      VALUES ($1,$2,$3,$4,NOW(),false,false)
      ON CONFLICT (email) DO UPDATE SET
        nombre = EXCLUDED.nombre, items = EXCLUDED.items, total = EXCLUDED.total,
        actualizado_en = NOW(), correo_enviado = false, recuperado = false
    `, [email.trim().toLowerCase(), nombre?.trim() || null, JSON.stringify(carrito), Number(total) || 0]);
    res.json({ exito: true });
  } catch (error) {
    console.error('POST /api/carrito-temporal:', error);
    res.status(500).json({ error: 'No se pudo guardar.' });
  }
});

app.post('/api/ordenes', limitadorPedidos, async (req, res) => {
  const {
    cliente, telefono, direccion, fecha, dedicatoria, carrito,
    destinatarioTelefono, tipoDomicilio, notasEntrega, horarioEntrega,
    lat, lng, firma, esAnonimo, conEnvio, emailContacto, codigoCupon
  } = req.body;

  if (!cliente?.trim() || !telefono?.trim() || !direccion?.trim() || !fecha || !Array.isArray(carrito) || carrito.length === 0) {
    return res.status(400).json({ error: 'Faltan datos obligatorios del pedido.' });
  }
  if (!emailContacto?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailContacto.trim())) {
    return res.status(400).json({ error: 'Ingresa un correo electrónico válido.' });
  }

  // El selector de fecha en la tienda ya evita elegir un día pasado, pero eso
  // es solo del lado del cliente -- una petición armada a mano podría
  // saltárselo. El límite es "el inicio de ayer en UTC" (fijo durante todo el
  // día) y no "hace 24 horas exactas" (una ventana que se recorre) -- así
  // cubre bien el caso de que el cliente esté en una zona horaria detrás de
  // UTC, donde su "hoy" real cae en la fecha de "ayer" para el servidor.
  const inicioHoyUTC = new Date(); inicioHoyUTC.setUTCHours(0, 0, 0, 0);
  const limiteFechaMs = inicioHoyUTC.getTime() - 24 * 60 * 60 * 1000;
  const fechaEntregaMs = Date.parse(`${fecha}T00:00:00Z`);
  if (!Number.isFinite(fechaEntregaMs) || fechaEntregaMs < limiteFechaMs) {
    return res.status(400).json({ error: 'La fecha de entrega no es válida.' });
  }

  const idsCarrito = carrito.map(item => Number(item.id));
  if (idsCarrito.some(id => !Number.isInteger(id) || id <= 0)) {
    return res.status(400).json({ error: 'El carrito contiene productos inválidos.' });
  }
  const ids = [...new Set(idsCarrito)];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const productos = await client.query(`
      SELECT id, nombre, precio, imagen_url, stock, es_combo
      FROM arreglos_florales
      WHERE id = ANY($1::int[]) AND COALESCE(disponible, true) = true
      FOR UPDATE
    `, [ids]);

    if (productos.rowCount !== ids.length) {
      throw Object.assign(new Error('Uno o más productos ya no están disponibles.'), { statusCode: 409 });
    }

    const porId = new Map(productos.rows.map(p => [p.id, p]));
    const cantidadPorId = new Map();
    carrito.forEach(item => {
      const id = Number(item.id);
      const cantidad = Math.max(1, Math.floor(Number(item.cantidad)) || 1);
      cantidadPorId.set(id, (cantidadPorId.get(id) || 0) + cantidad);
    });

    // Para los combos, lo que de verdad hay que revisar y descontar es el
    // stock de cada producto que lo compone -- el combo en sí no tiene un
    // stock propio independiente.
    const comboItems = await client.query(`
      SELECT pci.producto_id, pci.cantidad, a.id AS componente_id, a.nombre AS componente_nombre, a.stock AS componente_stock, a.disponible AS componente_disponible
      FROM producto_combo_items pci JOIN arreglos_florales a ON a.id = pci.componente_id
      WHERE pci.producto_id = ANY($1::int[])
      FOR UPDATE OF a
    `, [ids.filter(id => porId.get(id)?.es_combo)]);

    // Junta cuánto stock de cada producto (sea porque se vende directo, o
    // porque es componente de un combo que se está comprando) hace falta.
    const necesarioPorProducto = new Map();
    const sumarNecesario = (id, cantidad, nombre) => {
      const actual = necesarioPorProducto.get(id) || { cantidad: 0, nombre };
      actual.cantidad += cantidad;
      necesarioPorProducto.set(id, actual);
    };
    for (const [id, cantidad] of cantidadPorId) {
      const producto = porId.get(id);
      if (producto.es_combo) {
        const items = comboItems.rows.filter(c => c.producto_id === id);
        if (items.length === 0) throw Object.assign(new Error(`"${producto.nombre}" es un combo sin productos configurados.`), { statusCode: 409 });
        for (const item of items) {
          if (!item.componente_disponible) throw Object.assign(new Error(`"${item.componente_nombre}" (parte del combo "${producto.nombre}") ya no está disponible.`), { statusCode: 409 });
          sumarNecesario(item.componente_id, cantidad * item.cantidad, item.componente_nombre);
        }
      } else {
        sumarNecesario(id, cantidad, producto.nombre);
      }
    }
    for (const [id, info] of necesarioPorProducto) {
      const stockDisponible = Number(porId.get(id)?.stock ?? (comboItems.rows.find(c => c.componente_id === id)?.componente_stock ?? 0));
      if (stockDisponible < info.cantidad) {
        throw Object.assign(new Error(`Ya no hay suficiente existencia de "${info.nombre}" (quedan ${stockDisponible}).`), { statusCode: 409 });
      }
    }

    const carritoConfirmado = carrito.map(item => {
      const producto = porId.get(Number(item.id));
      const cantidad = Math.max(1, Math.floor(Number(item.cantidad)) || 1);
      return {
        id: producto.id,
        nombre: producto.nombre,
        precio: Number(producto.precio),
        cantidad,
        imagen: producto.imagen_url || null,
        variante: typeof item.variante === 'string' ? item.variante.trim() || null : null
      };
    });

    const subtotal = carritoConfirmado.reduce((sum, item) => sum + item.precio * item.cantidad, 0);
    const envio = conEnvio ? ENVIO_FIJO : 0;

    // Cupón (opcional) -- se vuelve a validar aquí adentro, con los datos
    // reales de la base, nunca confiando en un descuento que mande el propio
    // navegador.
    let descuento = 0;
    let cuponAplicado = null;
    if (codigoCupon && codigoCupon.trim()) {
      const clienteIdSesion = req.session && req.session.clienteId ? req.session.clienteId : null;
      const resultadoCupon = await client.query(
        'SELECT * FROM cupones WHERE UPPER(codigo)=UPPER($1) FOR UPDATE',
        [codigoCupon.trim()]
      );
      const cupon = resultadoCupon.rows[0];
      if (!cupon) throw Object.assign(new Error('El cupón no existe.'), { statusCode: 400 });
      if (!cupon.activo) throw Object.assign(new Error('Este cupón ya no está activo.'), { statusCode: 400 });
      if (cupon.fecha_inicio && new Date(cupon.fecha_inicio) > new Date()) throw Object.assign(new Error('Este cupón todavía no está disponible.'), { statusCode: 400 });
      if (cupon.fecha_expiracion && new Date(cupon.fecha_expiracion) < new Date()) throw Object.assign(new Error('Este cupón ya venció.'), { statusCode: 400 });
      if (cupon.usos_maximos !== null && cupon.usos_actuales >= cupon.usos_maximos) throw Object.assign(new Error('Este cupón ya alcanzó su límite de usos.'), { statusCode: 400 });
      if (Number(cupon.monto_minimo) > subtotal) throw Object.assign(new Error(`Este cupón requiere una compra mínima de $${Number(cupon.monto_minimo).toFixed(2)}.`), { statusCode: 400 });
      if (cupon.cliente_cuenta_id && cupon.cliente_cuenta_id !== clienteIdSesion) throw Object.assign(new Error('Este cupón no está disponible para tu cuenta.'), { statusCode: 400 });

      descuento = cupon.tipo === 'porcentaje' ? subtotal * (Number(cupon.valor) / 100) : Number(cupon.valor);
      descuento = Math.min(descuento, subtotal);
      cuponAplicado = cupon;

      await client.query('UPDATE cupones SET usos_actuales = usos_actuales + 1 WHERE id=$1', [cupon.id]);
    }

    const total = subtotal + envio - descuento;

    const latNum = Number(lat);
    const lngNum = Number(lng);

    const result = await client.query(`
      INSERT INTO ordenes
        (cliente_nombre, cliente_telefono, direccion_entrega, fecha_entrega, dedicatoria, carrito, total,
         destinatario_telefono, tipo_domicilio, notas_entrega, horario_entrega, lat, lng, firma, es_anonimo, envio, cliente_cuenta_id, email_contacto,
         cupon_codigo, descuento)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
      RETURNING *
    `, [
      cliente.trim(), telefono.trim(), direccion.trim(), fecha,
      dedicatoria?.trim() || null, JSON.stringify(carritoConfirmado), total,
      destinatarioTelefono?.trim() || null,
      tipoDomicilio?.trim() || null,
      notasEntrega?.trim() || null,
      horarioEntrega?.trim() || null,
      Number.isFinite(latNum) ? latNum : null,
      Number.isFinite(lngNum) ? lngNum : null,
      firma?.trim() || null,
      Boolean(esAnonimo),
      envio,
      // El ID de cuenta se toma de la sesión del servidor, nunca de lo que
      // mande el cliente -- así nadie puede adjudicarse pedidos ajenos.
      req.session && req.session.clienteId ? req.session.clienteId : null,
      emailContacto.trim().toLowerCase(),
      cuponAplicado ? cuponAplicado.codigo : null,
      descuento
    ]);

    // Ya que el pedido se registró bien, se descuenta el stock de verdad --
    // de cada producto directo, y de cada componente de combo.
    for (const [id, info] of necesarioPorProducto) {
      await client.query('UPDATE arreglos_florales SET stock = stock - $1 WHERE id = $2', [info.cantidad, id]);
    }

    await client.query('COMMIT');
    res.status(201).json({ exito: true, orden: result.rows[0] });
    // El correo se manda después de responder -- si Resend tarda o falla, no
    // hace que el cliente espere ni que la compra truene.
    enviarCorreoConfirmacionPedido(result.rows[0]);
    // Si esta persona tenía un carrito guardado como "abandonado" con este
    // mismo correo, ya no hace falta recordarle nada -- sí terminó comprando.
    pool.query('UPDATE carritos_abandonados SET recuperado = true WHERE email = $1', [emailContacto.trim().toLowerCase()]).catch(() => {});
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('POST /api/ordenes:', error);
    res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Error al crear el pedido.' });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// Pagos con Mercado Pago -- el pedido ya existe en "Pendiente" (creado arriba
// en POST /api/ordenes) antes de intentar cobrar.
//
// Se usa el "Payment Brick": el formulario de tarjeta/OXXO/SPEI vive DENTRO
// de checkout.html (no se redirige a Mercado Pago). El Brick tokeniza los
// datos sensibles en el navegador con la Public Key y nos manda solo el
// token -- nuestro servidor nunca ve el número de tarjeta.
//
// Variables de entorno necesarias (Railway → Settings → Variables):
//   MP_ACCESS_TOKEN   -- token privado (nunca se manda al navegador)
//   MP_PUBLIC_KEY     -- llave pública (esta sí se manda al navegador, es lo normal)
//   MP_MODO_PRUEBA    -- "true" mientras uses credenciales de prueba
//
// Mientras estas no estén configuradas, el checkout detecta que el pago no
// está disponible y deja pasar el pedido igual (nunca bloqueamos una venta
// por esto).
// ---------------------------------------------------------------------------
const mpAccessToken = process.env.MP_ACCESS_TOKEN;
const mpPublicKey = process.env.MP_PUBLIC_KEY;
const mpClient = mpAccessToken ? new MercadoPagoConfig({ accessToken: mpAccessToken }) : null;

app.get('/api/pagos/estado', (req, res) => {
  res.json({ disponible: Boolean(mpClient && mpPublicKey), publicKey: mpClient && mpPublicKey ? mpPublicKey : null });
});

// ---------------------------------------------------------------------------
// Google Maps (buscador de direcciones + mapa para ajustar el pin).
// Variable de entorno necesaria: GOOGLE_MAPS_API_KEY
// Esta clave SÍ está pensada para exponerse al navegador (así funciona la API
// de Maps) -- la seguridad real va en las restricciones que se configuran en
// Google Cloud Console (por dominio y por API permitida), no en ocultarla.
// Mientras no esté configurada, el checkout sigue funcionando: solo se piden
// los datos de la dirección a mano, sin buscador ni mapa.
// ---------------------------------------------------------------------------
app.get('/api/mapas/estado', (req, res) => {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || null;
  res.json({ disponible: Boolean(apiKey), apiKey });
});

// Recibe el resultado del Payment Brick (tarjeta ya tokenizada, u OXXO/SPEI)
// y crea el pago de verdad contra la API de Mercado Pago.
app.post('/api/pagos/procesar-pago', limitadorPagos, async (req, res) => {
  if (!mpClient) return res.status(503).json({ error: 'El cobro con tarjeta todavía no está configurado.' });
  const ordenId = Number(req.body?.ordenId);
  if (!Number.isInteger(ordenId) || ordenId <= 0) return res.status(400).json({ error: 'Pedido inválido.' });

  try {
    const resultado = await pool.query('SELECT * FROM ordenes WHERE id=$1', [ordenId]);
    const orden = resultado.rows[0];
    if (!orden) return res.status(404).json({ error: 'Pedido no encontrado.' });
    if (orden.estado_pago === 'aprobado') return res.status(409).json({ error: 'Este pedido ya fue pagado.' });

    // Estos campos vienen tal cual del "formData" que entrega el Payment Brick
    // en su onSubmit -- son exactamente lo que pide la API de Pagos.
    const { token, issuer_id, payment_method_id, installments, payer } = req.body;
    if (!payment_method_id) {
      return res.status(400).json({ error: 'Faltan datos del pago.' });
    }

    // El monto a cobrar SIEMPRE se toma del pedido ya guardado en la base de
    // datos, nunca de lo que mande el navegador -- así nadie puede alterar la
    // petición para pagar menos de lo que realmente cuesta el pedido.
    const montoReal = Number(orden.total);

    const payment = new Payment(mpClient);
    const pago = await payment.create({
      body: {
        transaction_amount: montoReal,
        token: token || undefined,
        description: `Pedido Reserva Floral #${orden.id}`,
        installments: installments ? Number(installments) : 1,
        payment_method_id,
        issuer_id: issuer_id || undefined,
        payer: {
          email: payer?.email || orden.email_contacto,
          identification: payer?.identification || undefined
        },
        external_reference: String(orden.id)
      },
      requestOptions: { idempotencyKey: `orden-${orden.id}-${Date.now()}` }
    });

    const estadoPago = { approved: 'aprobado', pending: 'pendiente', in_process: 'pendiente', rejected: 'rechazado', cancelled: 'rechazado' }[pago.status] || 'pendiente';
    await pool.query('UPDATE ordenes SET estado_pago=$1, mp_payment_id=$2 WHERE id=$3', [estadoPago, String(pago.id), orden.id]);
    if (estadoPago === 'aprobado') enviarCorreoPagoConfirmado({ ...orden, estado_pago: estadoPago });

    // Para OXXO/SPEI, Mercado Pago regresa la liga a la ficha (o los datos de
    // la transferencia) en algún lugar de la respuesta -- el nombre exacto del
    // campo varía según el medio de pago, así que probamos varias rutas
    // conocidas y, si no coincide con ninguna, lo dejamos registrado en el
    // log para poder ajustarlo.
    const urlComprobante =
      pago.transaction_details?.external_resource_url ||
      pago.point_of_interaction?.transaction_data?.ticket_url ||
      null;

    if (['oxxo', 'clabe'].includes(payment_method_id) && !urlComprobante) {
      console.warn(`No se encontró la liga del comprobante para ${payment_method_id}. Respuesta completa de Mercado Pago:`,
        JSON.stringify({ status: pago.status, status_detail: pago.status_detail, transaction_details: pago.transaction_details, point_of_interaction: pago.point_of_interaction }));
    }

    res.json({ status: pago.status, statusDetail: pago.status_detail, estadoPago, urlComprobante });
  } catch (error) {
    console.error('POST /api/pagos/procesar-pago:', error?.message, error?.cause || '');
    res.status(500).json({ error: 'No se pudo procesar el pago. Verifica los datos e intenta de nuevo.' });
  }
});

app.post('/api/pagos/crear-preferencia', limitadorPagos, async (req, res) => {
  if (!mpClient) return res.status(503).json({ error: 'El cobro con tarjeta todavía no está configurado.' });
  const ordenId = Number(req.body?.ordenId);
  if (!Number.isInteger(ordenId) || ordenId <= 0) return res.status(400).json({ error: 'Pedido inválido.' });

  try {
    const resultado = await pool.query('SELECT * FROM ordenes WHERE id=$1', [ordenId]);
    const orden = resultado.rows[0];
    if (!orden) return res.status(404).json({ error: 'Pedido no encontrado.' });
    if (orden.estado_pago === 'aprobado') return res.status(409).json({ error: 'Este pedido ya fue pagado.' });

    const items = Array.isArray(orden.carrito) ? orden.carrito : JSON.parse(orden.carrito || '[]');
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const preference = new Preference(mpClient);
    const respuestaMp = await preference.create({
      body: {
        items: [
          ...items.map(it => ({
            title: String(it.nombre || 'Producto').slice(0, 250),
            quantity: Math.max(1, Number(it.cantidad) || 1),
            currency_id: 'MXN',
            unit_price: Number(it.precio) || 0
          })),
          ...(Number(orden.envio) > 0 ? [{ title: 'Envío', quantity: 1, currency_id: 'MXN', unit_price: Number(orden.envio) }] : [])
        ],
        payer: orden.email_contacto ? { email: orden.email_contacto } : undefined,
        external_reference: String(orden.id),
        notification_url: `${baseUrl}/api/pagos/webhook`,
        back_urls: {
          success: `${baseUrl}/gracias.html?pedido=${orden.id}`,
          pending: `${baseUrl}/gracias.html?pedido=${orden.id}`,
          failure: `${baseUrl}/checkout.html?pago=fallido&pedido=${orden.id}`
        },
        auto_return: 'approved'
      }
    });

    await pool.query('UPDATE ordenes SET mp_preference_id=$1 WHERE id=$2', [respuestaMp.id, orden.id]);

    const enModoPrueba = String(process.env.MP_MODO_PRUEBA).toLowerCase() === 'true';
    res.json({
      preferenceId: respuestaMp.id,
      initPoint: enModoPrueba ? respuestaMp.sandbox_init_point : respuestaMp.init_point
    });
  } catch (error) {
    console.error('POST /api/pagos/crear-preferencia:', error);
    res.status(500).json({ error: 'No se pudo iniciar el pago.' });
  }
});

app.post('/api/pagos/webhook', async (req, res) => {
  // Mercado Pago espera un 200 rápido -- respondemos siempre OK y procesamos
  // el aviso; si algo falla adentro, se queda registrado en el log pero no
  // hacemos que Mercado Pago reintente indefinidamente por un error nuestro.
  res.sendStatus(200);
  if (!mpClient) return;
  try {
    const tipo = req.query.type || req.body?.type;
    const pagoId = req.query['data.id'] || req.body?.data?.id;
    if (tipo !== 'payment' || !pagoId) return;

    const payment = new Payment(mpClient);
    const pago = await payment.get({ id: pagoId });
    const ordenId = Number(pago.external_reference);
    if (!Number.isInteger(ordenId)) return;

    const estadoPago = { approved: 'aprobado', pending: 'pendiente', in_process: 'pendiente', rejected: 'rechazado', cancelled: 'rechazado', refunded: 'reembolsado' }[pago.status] || pago.status;

    // Se compara contra el estado anterior para no mandar el correo de "pago
    // confirmado" más de una vez si Mercado Pago reenvía el mismo aviso.
    const anterior = await pool.query('SELECT estado_pago FROM ordenes WHERE id=$1', [ordenId]);
    const yaEstabaAprobado = anterior.rows[0]?.estado_pago === 'aprobado';

    const actualizada = await pool.query('UPDATE ordenes SET estado_pago=$1, mp_payment_id=$2 WHERE id=$3 RETURNING *', [estadoPago, String(pago.id), ordenId]);
    if (estadoPago === 'aprobado' && !yaEstabaAprobado) enviarCorreoPagoConfirmado(actualizada.rows[0]);
  } catch (error) {
    console.error('POST /api/pagos/webhook:', error);
  }
});

// ---------------------------------------------------------------------------
// Panel de administración: pedidos
// ---------------------------------------------------------------------------
const ESTADOS_ORDEN_VALIDOS = ['Pendiente', 'Confirmado', 'En preparación', 'En camino', 'Entregado', 'Cancelado'];

app.get('/api/admin/ordenes', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM ordenes ORDER BY id DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('GET /api/admin/ordenes:', error);
    res.status(500).json({ error: 'Error del servidor al cargar los pedidos.' });
  }
});

app.patch('/api/admin/ordenes/:id/estado', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'ID de pedido inválido.' });
  }
  const { estado } = req.body;
  if (!ESTADOS_ORDEN_VALIDOS.includes(estado)) {
    return res.status(400).json({ error: 'Estado de pedido inválido.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const anterior = await client.query('SELECT * FROM ordenes WHERE id=$1 FOR UPDATE', [id]);
    if (anterior.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Pedido no encontrado.' });
    }
    const ordenAnterior = anterior.rows[0];

    // Si se cancela un pedido que no estaba cancelado, se le regresa al
    // inventario el stock que se le había descontado (expandiendo combos a
    // sus componentes, igual que al momento de comprar).
    if (estado === 'Cancelado' && ordenAnterior.estado !== 'Cancelado') {
      const carritoOriginal = Array.isArray(ordenAnterior.carrito) ? ordenAnterior.carrito : JSON.parse(ordenAnterior.carrito || '[]');
      const idsCarrito = [...new Set(carritoOriginal.map(item => Number(item.id)))];
      const productosInfo = await client.query('SELECT id, es_combo FROM arreglos_florales WHERE id = ANY($1::int[])', [idsCarrito]);
      const esComboPorId = new Map(productosInfo.rows.map(p => [p.id, p.es_combo]));
      const comboItems = await client.query(`
        SELECT producto_id, componente_id, cantidad FROM producto_combo_items WHERE producto_id = ANY($1::int[])
      `, [idsCarrito.filter(pid => esComboPorId.get(pid))]);

      const restaurarPorId = new Map();
      const sumar = (pid, cant) => restaurarPorId.set(pid, (restaurarPorId.get(pid) || 0) + cant);
      for (const item of carritoOriginal) {
        const pid = Number(item.id);
        const cantidad = Math.max(1, Math.floor(Number(item.cantidad)) || 1);
        if (esComboPorId.get(pid)) {
          comboItems.rows.filter(c => c.producto_id === pid).forEach(c => sumar(c.componente_id, cantidad * c.cantidad));
        } else {
          sumar(pid, cantidad);
        }
      }
      for (const [pid, cantidad] of restaurarPorId) {
        await client.query('UPDATE arreglos_florales SET stock = stock + $1 WHERE id = $2', [cantidad, pid]);
      }
    }

    const result = await client.query('UPDATE ordenes SET estado=$1 WHERE id=$2 RETURNING *', [estado, id]);
    await client.query('COMMIT');
    await enviarCorreoEstadoActualizado(result.rows[0], estado);
    await registrarBitacora(req, 'Cambió el estado de un pedido', `Pedido #${id} → ${estado}`);
    res.json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('PATCH /api/admin/ordenes/:id/estado:', error);
    res.status(500).json({ error: 'Error al actualizar el pedido.' });
  } finally {
    client.release();
  }
});

// Notas internas de un pedido -- nunca las ve el cliente, son para que el
// equipo se deje avisos entre sí (ej. "cliente pidió cambiar la hora").
// Solicitudes de factura pendientes de atender -- para que el negocio sepa
// a quién le falta generar y subir su comprobante fiscal.
app.get('/api/admin/facturas-pendientes', requireAuth, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT id, cliente_nombre, total, factura_rfc, factura_razon_social, factura_uso_cfdi, factura_cp, factura_email, factura_solicitada_en
       FROM ordenes WHERE factura_estado='pendiente' ORDER BY factura_solicitada_en ASC`
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('GET /api/admin/facturas-pendientes:', error);
    res.status(500).json({ error: 'No se pudieron cargar las solicitudes de factura.' });
  }
});

// Historial de facturas ya atendidas -- para consultarlas después (si el
// cliente perdió el archivo, o para tu propia contabilidad).
app.get('/api/admin/facturas-historial', requireAuth, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT id, cliente_nombre, total, factura_rfc, factura_razon_social, factura_uso_cfdi, factura_cp, factura_email, factura_archivo_url, factura_atendida_en
       FROM ordenes WHERE factura_estado='lista' ORDER BY factura_atendida_en DESC LIMIT 100`
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('GET /api/admin/facturas-historial:', error);
    res.status(500).json({ error: 'No se pudo cargar el historial de facturas.' });
  }
});

// El negocio sube aquí el PDF (y si quiere, el XML) de la factura que ya
// generó por su cuenta -- esto NO emite un CFDI real, solo guarda el
// archivo para que el cliente lo pueda descargar desde "Mis pedidos".
app.post('/api/admin/ordenes/:id/factura', requireAuth, (req, res) => {
  subirFactura.single('archivo')(req, res, async (error) => {
    if (error) return res.status(400).json({ error: error.message || 'No se pudo subir el archivo.' });
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido.' });
    if (!req.file) return res.status(400).json({ error: 'Sube el archivo de la factura (PDF o XML).' });
    try {
      const url = `/uploads/${req.file.filename}`;
      const resultado = await pool.query(
        `UPDATE ordenes SET factura_estado='lista', factura_archivo_url=$1, factura_atendida_en=NOW() WHERE id=$2 RETURNING *`,
        [url, id]
      );
      if (resultado.rowCount === 0) return res.status(404).json({ error: 'Pedido no encontrado.' });
      const orden = resultado.rows[0];
      if (resendClient && orden.factura_email) {
        const cuerpo = `
          <h2 style="font-size:16px;margin:0 0 8px;">🧾 Tu factura ya está lista</h2>
          <p style="font-size:13px;color:#666;">La factura de tu pedido <strong>#${orden.id}</strong> ya está disponible. Puedes descargarla desde "Mis pedidos" en tu cuenta.</p>
          <p style="margin-top:16px;"><a href="${URL_SITIO}/cuenta#pedidos" style="background:#c2185b;color:#fff;padding:10px 20px;border-radius:999px;text-decoration:none;font-size:13px;">Ver mi factura</a></p>
        `;
        resendClient.emails.send({
          from: CORREO_REMITENTE, to: orden.factura_email, subject: `Tu factura está lista — Pedido #${orden.id}`,
          html: await plantillaBaseCorreo('Tu factura está lista', cuerpo)
        }).catch(err => console.error('No se pudo avisar que la factura esta lista:', err?.message || err));
      }
      res.json({ exito: true });
    } catch (error) {
      console.error('POST /api/admin/ordenes/:id/factura:', error);
      res.status(500).json({ error: 'No se pudo guardar la factura.' });
    }
  });
});

app.get('/api/admin/ordenes/:id/notas', requireAuth, async (req, res) => {
  try {
    const resultado = await pool.query('SELECT * FROM pedido_notas WHERE orden_id = $1 ORDER BY creado_en ASC', [req.params.id]);
    res.json(resultado.rows);
  } catch (error) {
    console.error('GET /api/admin/ordenes/:id/notas:', error);
    res.status(500).json({ error: 'No se pudieron cargar las notas.' });
  }
});
app.post('/api/admin/ordenes/:id/notas', requireAuth, async (req, res) => {
  const nota = String(req.body?.nota || '').trim();
  if (!nota) return res.status(400).json({ error: 'Escribe algo para la nota.' });
  try {
    const resultado = await pool.query(
      'INSERT INTO pedido_notas (orden_id, autor, nota) VALUES ($1,$2,$3) RETURNING *',
      [req.params.id, req.session?.nombre || 'Alguien del equipo', nota]
    );
    res.status(201).json(resultado.rows[0]);
  } catch (error) {
    console.error('POST /api/admin/ordenes/:id/notas:', error);
    res.status(500).json({ error: 'No se pudo guardar la nota.' });
  }
});
app.delete('/api/admin/ordenes/notas/:notaId', requireAuth, async (req, res) => {
  try {
    const resultado = await pool.query('DELETE FROM pedido_notas WHERE id=$1', [req.params.notaId]);
    if (resultado.rowCount === 0) return res.status(404).json({ error: 'Nota no encontrada.' });
    res.json({ exito: true });
  } catch (error) {
    console.error('DELETE /api/admin/ordenes/notas/:notaId:', error);
    res.status(500).json({ error: 'No se pudo borrar la nota.' });
  }
});

// Bitácora del panel: quién hizo qué. Solo un administrador puede verla.
app.get('/api/admin/bitacora', requireAuth, requireAdmin, async (req, res) => {
  try {
    const resultado = await pool.query('SELECT * FROM bitacora_admin ORDER BY creado_en DESC LIMIT 200');
    res.json(resultado.rows);
  } catch (error) {
    console.error('GET /api/admin/bitacora:', error);
    res.status(500).json({ error: 'No se pudo cargar la bitácora.' });
  }
});

// Vista previa de cómo se ve cada correo automático -- arma el mismo HTML
// que de verdad se manda (usando datos de ejemplo), para que se pueda ver el
// diseño sin tener que provocar un pedido real. Se abre directo en una
// pestaña nueva desde el panel.
const ORDEN_EJEMPLO_CORREO = {
  id: 1042, cliente_nombre: 'Ana Torres', total: 850,
  carrito: [{ nombre: 'Ramo de Rosas Rojas', cantidad: 1, precio: 650 }, { nombre: 'Caja de Chocolates', cantidad: 1, precio: 200 }],
  fecha_entrega: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
  horario_entrega: '3:00 pm - 5:00 pm',
  direccion_entrega: 'Calle Falsa 123, Col. Centro, Cd. Madero, Tamaulipas'
};
app.get('/api/admin/correos/vista-previa/:tipo', requireAuth, async (req, res) => {
  try {
    let datos;
    if (req.params.tipo === 'confirmacion') datos = construirCorreoConfirmacion(ORDEN_EJEMPLO_CORREO);
    else if (req.params.tipo === 'pago') datos = construirCorreoPagoConfirmado(ORDEN_EJEMPLO_CORREO);
    else if (req.params.tipo === 'estado') datos = construirCorreoEstadoActualizado(ORDEN_EJEMPLO_CORREO, MENSAJES_ESTADO_CORREO[req.query.estado] ? req.query.estado : 'En camino');
    else if (req.params.tipo === 'carrito') datos = construirCorreoCarritoAbandonado({ nombre: 'Ana', email: 'ana@ejemplo.com', total: 850, items: ORDEN_EJEMPLO_CORREO.carrito });
    else return res.status(400).send('Tipo de correo no reconocido.');

    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(await plantillaBaseCorreo(datos.titulo, datos.cuerpo));
  } catch (error) {
    console.error('GET /api/admin/correos/vista-previa/:tipo:', error);
    res.status(500).send('No se pudo generar la vista previa.');
  }
});

// ---------------------------------------------------------------------------
// Panel de administración: dashboard
// ---------------------------------------------------------------------------
app.get('/api/admin/dashboard', requireAuth, async (req, res) => {
  try {
    const [productos, ordenesRecientes, stockBajo] = await Promise.all([
      pool.query('SELECT id, disponible, stock, categoria FROM arreglos_florales'),
      pool.query('SELECT * FROM ordenes ORDER BY id DESC LIMIT 400'),
      pool.query(`SELECT id, nombre, stock FROM arreglos_florales WHERE COALESCE(disponible,true)=true AND COALESCE(stock,1) <= 2 ORDER BY stock ASC LIMIT 10`)
    ]);

    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const inicioSemana = new Date(hoy); inicioSemana.setDate(hoy.getDate() - 6);
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

    const ordenesActivas = ordenesRecientes.rows.filter(o => o.estado !== 'Cancelado');
    const sumaEnRango = (desde) => ordenesActivas
      .filter(o => new Date(o.creado_en) >= desde)
      .reduce((s, o) => s + Number(o.total || 0), 0);
    const contarEnRango = (desde) => ordenesActivas.filter(o => new Date(o.creado_en) >= desde).length;

    const conteoProductos = {};
    for (const orden of ordenesActivas) {
      const items = Array.isArray(orden.carrito) ? orden.carrito : [];
      for (const item of items) {
        const clave = item.nombre || 'Producto';
        const cantidad = Math.max(1, Number(item.cantidad) || 1);
        conteoProductos[clave] = (conteoProductos[clave] || 0) + cantidad;
      }
    }
    const productosPopulares = Object.entries(conteoProductos)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([nombre, cantidad]) => ({ nombre, cantidad }));

    res.json({
      productos: {
        total: productos.rows.length,
        disponibles: productos.rows.filter(p => p.disponible !== false).length,
        agotados: productos.rows.filter(p => p.disponible === false).length,
        categorias: new Set(productos.rows.map(p => p.categoria).filter(Boolean)).size
      },
      pedidos: {
        hoy: contarEnRango(hoy),
        semana: contarEnRango(inicioSemana),
        pendientes: ordenesRecientes.rows.filter(o => o.estado === 'Pendiente').length,
        totalHistorico: ordenesRecientes.rows.length
      },
      ingresos: {
        hoy: sumaEnRango(hoy),
        semana: sumaEnRango(inicioSemana),
        mes: sumaEnRango(inicioMes)
      },
      productosPopulares,
      stockBajo: stockBajo.rows,
      ultimosPedidos: ordenesRecientes.rows.slice(0, 6)
    });
  } catch (error) {
    console.error('GET /api/admin/dashboard:', error);
    res.status(500).json({ error: 'No se pudo cargar el dashboard.' });
  }
});

// ---------------------------------------------------------------------------
// Panel de administración: finanzas
// ---------------------------------------------------------------------------
app.get('/api/admin/finanzas', requireAuth, async (req, res) => {
  const dias = Math.min(Math.max(Number(req.query.dias) || 30, 7), 180);
  try {
    const serieDiaria = await pool.query(`
      SELECT DATE(creado_en) AS fecha, COALESCE(SUM(total),0) AS total, COUNT(*)::int AS pedidos
      FROM ordenes
      WHERE estado != 'Cancelado' AND creado_en >= NOW() - INTERVAL '${dias} days'
      GROUP BY DATE(creado_en)
      ORDER BY fecha ASC
    `);

    const todas = await pool.query(`SELECT * FROM ordenes WHERE creado_en >= NOW() - INTERVAL '${dias} days'`);
    const activas = todas.rows.filter(o => o.estado !== 'Cancelado');
    const canceladas = todas.rows.length - activas.length;

    const ingresoPorProducto = {};
    for (const orden of activas) {
      const items = Array.isArray(orden.carrito) ? orden.carrito : [];
      for (const item of items) {
        const clave = item.nombre || 'Producto';
        const cantidad = Math.max(1, Number(item.cantidad) || 1);
        if (!ingresoPorProducto[clave]) ingresoPorProducto[clave] = { nombre: clave, unidades: 0, ingresos: 0 };
        ingresoPorProducto[clave].unidades += cantidad;
        ingresoPorProducto[clave].ingresos += Number(item.precio || 0) * cantidad;
      }
    }
    const topProductos = Object.values(ingresoPorProducto).sort((a, b) => b.ingresos - a.ingresos).slice(0, 8);

    const ingresosTotales = activas.reduce((s, o) => s + Number(o.total || 0), 0);
    const ticketPromedio = activas.length ? ingresosTotales / activas.length : 0;

    const porEstado = {};
    for (const o of todas.rows) porEstado[o.estado || 'Pendiente'] = (porEstado[o.estado || 'Pendiente'] || 0) + 1;

    res.json({
      rango_dias: dias,
      resumen: {
        ingresosTotales,
        pedidosTotales: todas.rows.length,
        pedidosCancelados: canceladas,
        ticketPromedio
      },
      serieDiaria: serieDiaria.rows,
      topProductos,
      porEstado
    });
  } catch (error) {
    console.error('GET /api/admin/finanzas:', error);
    res.status(500).json({ error: 'No se pudo cargar la información financiera.' });
  }
});

// ---------------------------------------------------------------------------
// Panel de administración: clientes (derivados de los pedidos)
// ---------------------------------------------------------------------------
app.get('/api/admin/clientes', requireAuth, async (req, res) => {
  try {
    const resultado = await pool.query(`
      SELECT
        cliente_telefono AS telefono,
        (array_agg(cliente_nombre ORDER BY creado_en DESC))[1] AS nombre,
        (array_agg(direccion_entrega ORDER BY creado_en DESC))[1] AS ultima_direccion,
        (array_agg(email_contacto ORDER BY creado_en DESC))[1] AS email,
        bool_or(cliente_cuenta_id IS NOT NULL) AS tiene_cuenta,
        COUNT(*)::int AS pedidos,
        COALESCE(SUM(total) FILTER (WHERE estado != 'Cancelado'), 0) AS total_gastado,
        MAX(creado_en) AS ultimo_pedido,
        MIN(creado_en) AS primer_pedido
      FROM ordenes
      GROUP BY cliente_telefono
      ORDER BY total_gastado DESC
    `);
    res.json(resultado.rows);
  } catch (error) {
    console.error('GET /api/admin/clientes:', error);
    res.status(500).json({ error: 'No se pudo cargar la lista de clientes.' });
  }
});

// Recordatorios que los clientes se guardaron (ej. cumpleaños, aniversarios)
// -- antes el negocio no tenía forma de verlos para poder contactar a
// tiempo. Se muestran ordenados por qué tan pronto se cumplen.
app.get('/api/admin/recordatorios', requireAuth, async (req, res) => {
  try {
    const resultado = await pool.query(`
      SELECT r.id, r.titulo, r.fecha, r.repetir_anual, r.notas,
             (c.nombre || ' ' || c.apellido) AS cliente_nombre, c.email AS cliente_email, c.telefono AS cliente_telefono
      FROM recordatorios_cliente r
      JOIN clientes_cuenta c ON c.id = r.cliente_cuenta_id
      ORDER BY r.fecha ASC
    `);
    res.json(resultado.rows);
  } catch (error) {
    console.error('GET /api/admin/recordatorios:', error);
    res.status(500).json({ error: 'No se pudieron cargar los recordatorios.' });
  }
});

// ---------------------------------------------------------------------------
// Panel de administración: zonas de cobertura (envíos)
// ---------------------------------------------------------------------------
app.get('/api/zonas', async (req, res) => {
  try {
    const resultado = await pool.query('SELECT nombre, etiqueta, estado FROM zonas_cobertura WHERE activa=true ORDER BY orden ASC, etiqueta ASC');
    res.json(resultado.rows);
  } catch (error) {
    console.error('GET /api/zonas:', error);
    res.status(500).json({ error: 'No se pudieron cargar las zonas.' });
  }
});

app.get('/api/admin/zonas', requireAuth, async (req, res) => {
  try {
    const resultado = await pool.query('SELECT * FROM zonas_cobertura ORDER BY orden ASC, etiqueta ASC');
    res.json(resultado.rows);
  } catch (error) {
    console.error('GET /api/admin/zonas:', error);
    res.status(500).json({ error: 'No se pudieron cargar las zonas.' });
  }
});

// Estados y municipios reales de México, para llenar los selectores en
// cascada de Estado/Ciudad al registrar una zona -- ya no es texto libre.
app.get('/api/admin/estados-municipios', requireAuth, (req, res) => {
  res.json(ESTADOS_MUNICIPIOS_MX);
});

app.post('/api/admin/zonas', requireAuth, async (req, res) => {
  const { etiqueta, estado, orden } = req.body || {};
  if (!etiqueta?.trim() || !estado?.trim()) {
    return res.status(400).json({ error: 'El estado y la ciudad son obligatorios.' });
  }
  // El "nombre interno" (la clave que queda guardada en la cobertura de cada
  // producto) ya no lo escribe el negocio a mano -- se arma solo a partir
  // del estado y la ciudad elegidos, para no arriesgarse a un typo que
  // rompa el filtrado por ciudad.
  const slug = texto => String(texto).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  let nombreBase = slug(estado) + '-' + slug(etiqueta);
  let nombreFinal = nombreBase;
  try {
    let intento = 1;
    while ((await pool.query('SELECT 1 FROM zonas_cobertura WHERE nombre=$1', [nombreFinal])).rowCount > 0) {
      intento++;
      nombreFinal = `${nombreBase}-${intento}`;
    }
    const resultado = await pool.query(
      'INSERT INTO zonas_cobertura (nombre, etiqueta, estado, orden) VALUES ($1,$2,$3,$4) RETURNING *',
      [nombreFinal, etiqueta.trim(), estado.trim(), Number.isFinite(Number(orden)) ? Number(orden) : 0]
    );
    res.status(201).json(resultado.rows[0]);
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Esa ciudad ya está registrada.' });
    console.error('POST /api/admin/zonas:', error);
    res.status(500).json({ error: 'No se pudo crear la zona.' });
  }
});

app.patch('/api/admin/zonas/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido.' });
  const campos = []; const valores = []; let i = 1;
  if (typeof req.body.etiqueta === 'string' && req.body.etiqueta.trim()) { campos.push(`etiqueta=$${i++}`); valores.push(req.body.etiqueta.trim()); }
  if (typeof req.body.estado === 'string' && req.body.estado.trim()) { campos.push(`estado=$${i++}`); valores.push(req.body.estado.trim()); }
  if (typeof req.body.activa === 'boolean') { campos.push(`activa=$${i++}`); valores.push(req.body.activa); }
  if (Number.isFinite(Number(req.body.orden))) { campos.push(`orden=$${i++}`); valores.push(Number(req.body.orden)); }
  if (campos.length === 0) return res.status(400).json({ error: 'No hay cambios para guardar.' });
  valores.push(id);
  try {
    const resultado = await pool.query(`UPDATE zonas_cobertura SET ${campos.join(', ')} WHERE id=$${i} RETURNING *`, valores);
    if (resultado.rowCount === 0) return res.status(404).json({ error: 'Zona no encontrada.' });
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('PATCH /api/admin/zonas/:id:', error);
    res.status(500).json({ error: 'No se pudo actualizar la zona.' });
  }
});

app.delete('/api/admin/zonas/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido.' });
  try {
    const resultado = await pool.query('DELETE FROM zonas_cobertura WHERE id=$1', [id]);
    if (resultado.rowCount === 0) return res.status(404).json({ error: 'Zona no encontrada.' });
    res.json({ exito: true });
  } catch (error) {
    console.error('DELETE /api/admin/zonas/:id:', error);
    res.status(500).json({ error: 'No se pudo eliminar la zona.' });
  }
});

// ---------------------------------------------------------------------------
// Carruseles del inicio ("Entregas el mismo día..." y "Ocasiones")
// El negocio administra estas tarjetas -- imagen, título y a dónde llevan --
// desde el panel, sin tocar código. "carrusel" es 'categorias' u 'ocasiones'.
// ---------------------------------------------------------------------------
app.get('/api/carruseles', async (req, res) => {
  try {
    const resultado = await pool.query(
      "SELECT carrusel, titulo, imagen_url, enlace FROM carruseles_inicio WHERE activo=true ORDER BY carrusel ASC, orden ASC, id ASC"
    );
    const agrupado = { categorias: [], ocasiones: [] };
    resultado.rows.forEach(fila => {
      if (agrupado[fila.carrusel]) agrupado[fila.carrusel].push(fila);
    });
    res.json(agrupado);
  } catch (error) {
    console.error('GET /api/carruseles:', error);
    res.status(500).json({ error: 'No se pudo cargar el contenido del inicio.' });
  }
});

app.get('/api/admin/carruseles', requireAuth, async (req, res) => {
  try {
    const resultado = await pool.query('SELECT * FROM carruseles_inicio ORDER BY carrusel ASC, orden ASC, id ASC');
    res.json(resultado.rows);
  } catch (error) {
    console.error('GET /api/admin/carruseles:', error);
    res.status(500).json({ error: 'No se pudo cargar el contenido del inicio.' });
  }
});

app.post('/api/admin/carruseles', requireAuth, async (req, res) => {
  const { carrusel, titulo, imagen_url, enlace } = req.body || {};
  if (!['categorias', 'ocasiones'].includes(carrusel)) return res.status(400).json({ error: 'El carrusel debe ser "categorias" u "ocasiones".' });
  if (!titulo?.trim() || !imagen_url?.trim() || !enlace?.trim()) {
    return res.status(400).json({ error: 'El título, la imagen y el enlace son obligatorios.' });
  }
  try {
    const maxOrden = await pool.query('SELECT COALESCE(MAX(orden), 0) + 1 AS siguiente FROM carruseles_inicio WHERE carrusel=$1', [carrusel]);
    const resultado = await pool.query(
      'INSERT INTO carruseles_inicio (carrusel, titulo, imagen_url, enlace, orden) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [carrusel, titulo.trim(), imagen_url.trim(), enlace.trim(), maxOrden.rows[0].siguiente]
    );
    res.status(201).json(resultado.rows[0]);
  } catch (error) {
    console.error('POST /api/admin/carruseles:', error);
    res.status(500).json({ error: 'No se pudo crear la tarjeta.' });
  }
});

app.patch('/api/admin/carruseles/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido.' });
  const campos = []; const valores = []; let i = 1;
  if (typeof req.body.titulo === 'string' && req.body.titulo.trim()) { campos.push(`titulo=$${i++}`); valores.push(req.body.titulo.trim()); }
  if (typeof req.body.imagen_url === 'string' && req.body.imagen_url.trim()) { campos.push(`imagen_url=$${i++}`); valores.push(req.body.imagen_url.trim()); }
  if (typeof req.body.enlace === 'string' && req.body.enlace.trim()) { campos.push(`enlace=$${i++}`); valores.push(req.body.enlace.trim()); }
  if (typeof req.body.activo === 'boolean') { campos.push(`activo=$${i++}`); valores.push(req.body.activo); }
  if (Number.isFinite(Number(req.body.orden))) { campos.push(`orden=$${i++}`); valores.push(Number(req.body.orden)); }
  if (campos.length === 0) return res.status(400).json({ error: 'No hay cambios para guardar.' });
  valores.push(id);
  try {
    const resultado = await pool.query(`UPDATE carruseles_inicio SET ${campos.join(', ')} WHERE id=$${i} RETURNING *`, valores);
    if (resultado.rowCount === 0) return res.status(404).json({ error: 'Tarjeta no encontrada.' });
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('PATCH /api/admin/carruseles/:id:', error);
    res.status(500).json({ error: 'No se pudo actualizar la tarjeta.' });
  }
});

// Reordenar: recibe la lista completa de IDs de un carrusel en el orden
// deseado (arrastrar y soltar en el panel) y actualiza el campo "orden" de
// todas de una vez.
app.post('/api/admin/carruseles/reordenar', requireAuth, async (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || ids.some(id => !Number.isInteger(id))) {
    return res.status(400).json({ error: 'Se esperaba una lista de IDs.' });
  }
  try {
    for (let pos = 0; pos < ids.length; pos++) {
      await pool.query('UPDATE carruseles_inicio SET orden=$1 WHERE id=$2', [pos + 1, ids[pos]]);
    }
    res.json({ exito: true });
  } catch (error) {
    console.error('POST /api/admin/carruseles/reordenar:', error);
    res.status(500).json({ error: 'No se pudo guardar el nuevo orden.' });
  }
});

app.delete('/api/admin/carruseles/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido.' });
  try {
    const resultado = await pool.query('DELETE FROM carruseles_inicio WHERE id=$1', [id]);
    if (resultado.rowCount === 0) return res.status(404).json({ error: 'Tarjeta no encontrada.' });
    res.json({ exito: true });
  } catch (error) {
    console.error('DELETE /api/admin/carruseles/:id:', error);
    res.status(500).json({ error: 'No se pudo eliminar la tarjeta.' });
  }
});

// ---------------------------------------------------------------------------
// Menú de navegación (las pestañas de arriba del sitio: Cumpleaños, Ocasiones,
// Flores y plantas, Globos, Regalos... y todos sus submenús). 3 niveles:
// 0 = pestaña, 1 = columna dentro del submenú, 2 = enlace de esa columna.
// Todo administrable desde el panel, sin tocar código.
// ---------------------------------------------------------------------------
function construirArbolMenu(filas) {
  const porId = {};
  filas.forEach(f => { porId[f.id] = { ...f, hijos: [] }; });
  const raiz = [];
  filas.forEach(f => {
    if (f.padre_id === null) raiz.push(porId[f.id]);
    else if (porId[f.padre_id]) porId[f.padre_id].hijos.push(porId[f.id]);
  });
  const ordenar = nodo => { nodo.hijos.sort((a, b) => a.orden - b.orden); nodo.hijos.forEach(ordenar); };
  raiz.sort((a, b) => a.orden - b.orden);
  raiz.forEach(ordenar);
  return raiz;
}

// Taxonomía pública (categoría > subcategoría > tipo): la usa el front para
// reconocer las rutas tipo /estado/ciudad/categoria/subcategoria/tipo.
// Arma la taxonomía (categoría > subcategoría > tipo) en vivo desde el
// "Menú del sitio" -- una sola función que usan tanto el endpoint público
// (para resolver las rutas bonitas) como el del panel (para los
// desplegables de clasificar productos), así nunca quedan desincronizados.
async function construirTaxonomiaDesdeMenu() {
  const filas = (await pool.query('SELECT * FROM menu_navegacion WHERE activo=true ORDER BY orden ASC, id ASC')).rows;
  const porId = {};
  filas.forEach(f => { porId[f.id] = { ...f, hijos: [] }; });
  const raiz = [];
  filas.forEach(f => {
    if (f.padre_id === null) raiz.push(porId[f.id]);
    else if (porId[f.padre_id]) porId[f.padre_id].hijos.push(porId[f.id]);
  });
  const taxonomia = {};
  raiz.forEach(tab => {
    if (tab.titulo === 'Inicio') return;
    taxonomia[tab.titulo] = {};
    tab.hijos.forEach(columna => {
      taxonomia[tab.titulo][columna.titulo] = columna.hijos.map(h => h.titulo);
    });
  });
  return taxonomia;
}

app.get('/api/taxonomia', async (req, res) => {
  try {
    res.json(await construirTaxonomiaDesdeMenu());
  } catch (error) {
    console.error('GET /api/taxonomia:', error);
    res.json(TAXONOMIA_CATALOGO);
  }
});

app.get('/api/menu-navegacion', async (req, res) => {
  try {
    const resultado = await pool.query('SELECT * FROM menu_navegacion WHERE activo=true ORDER BY orden ASC, id ASC');
    res.json(construirArbolMenu(resultado.rows));
  } catch (error) {
    console.error('GET /api/menu-navegacion:', error);
    res.status(500).json({ error: 'No se pudo cargar el menú.' });
  }
});

app.get('/api/admin/menu-navegacion', requireAuth, async (req, res) => {
  try {
    const resultado = await pool.query('SELECT * FROM menu_navegacion ORDER BY orden ASC, id ASC');
    res.json(construirArbolMenu(resultado.rows));
  } catch (error) {
    console.error('GET /api/admin/menu-navegacion:', error);
    res.status(500).json({ error: 'No se pudo cargar el menú.' });
  }
});

app.post('/api/admin/menu-navegacion', requireAuth, async (req, res) => {
  const { padre_id, titulo, enlace } = req.body || {};
  if (!titulo?.trim()) return res.status(400).json({ error: 'El título es obligatorio.' });
  try {
    let nivel = 0;
    if (padre_id) {
      const padre = await pool.query('SELECT nivel FROM menu_navegacion WHERE id=$1', [padre_id]);
      if (padre.rowCount === 0) return res.status(400).json({ error: 'El elemento padre no existe.' });
      nivel = padre.rows[0].nivel + 1;
      if (nivel > 2) return res.status(400).json({ error: 'Ya no se pueden agregar más niveles aquí.' });
    }
    const maxOrden = await pool.query(
      'SELECT COALESCE(MAX(orden), 0) + 1 AS siguiente FROM menu_navegacion WHERE padre_id IS NOT DISTINCT FROM $1',
      [padre_id || null]
    );
    const resultado = await pool.query(
      'INSERT INTO menu_navegacion (padre_id, nivel, titulo, enlace, orden) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [padre_id || null, nivel, titulo.trim(), enlace?.trim() || null, maxOrden.rows[0].siguiente]
    );
    res.status(201).json({ ...resultado.rows[0], hijos: [] });
  } catch (error) {
    console.error('POST /api/admin/menu-navegacion:', error);
    res.status(500).json({ error: 'No se pudo crear el elemento.' });
  }
});

app.patch('/api/admin/menu-navegacion/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido.' });
  const campos = []; const valores = []; let i = 1;
  if (typeof req.body.titulo === 'string' && req.body.titulo.trim()) { campos.push(`titulo=$${i++}`); valores.push(req.body.titulo.trim()); }
  if ('enlace' in req.body) { campos.push(`enlace=$${i++}`); valores.push(req.body.enlace?.trim() || null); }
  if (typeof req.body.activo === 'boolean') { campos.push(`activo=$${i++}`); valores.push(req.body.activo); }
  if (campos.length === 0) return res.status(400).json({ error: 'No hay cambios para guardar.' });
  valores.push(id);
  try {
    const resultado = await pool.query(`UPDATE menu_navegacion SET ${campos.join(', ')} WHERE id=$${i} RETURNING *`, valores);
    if (resultado.rowCount === 0) return res.status(404).json({ error: 'Elemento no encontrado.' });
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('PATCH /api/admin/menu-navegacion/:id:', error);
    res.status(500).json({ error: 'No se pudo actualizar.' });
  }
});

app.post('/api/admin/menu-navegacion/reordenar', requireAuth, async (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || ids.some(id => !Number.isInteger(id))) {
    return res.status(400).json({ error: 'Se esperaba una lista de IDs.' });
  }
  try {
    for (let pos = 0; pos < ids.length; pos++) {
      await pool.query('UPDATE menu_navegacion SET orden=$1 WHERE id=$2', [pos + 1, ids[pos]]);
    }
    res.json({ exito: true });
  } catch (error) {
    console.error('POST /api/admin/menu-navegacion/reordenar:', error);
    res.status(500).json({ error: 'No se pudo guardar el nuevo orden.' });
  }
});

app.delete('/api/admin/menu-navegacion/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido.' });
  try {
    const resultado = await pool.query('DELETE FROM menu_navegacion WHERE id=$1', [id]);
    if (resultado.rowCount === 0) return res.status(404).json({ error: 'Elemento no encontrado.' });
    res.json({ exito: true });
  } catch (error) {
    console.error('DELETE /api/admin/menu-navegacion/:id:', error);
    res.status(500).json({ error: 'No se pudo eliminar.' });
  }
});

// Categorías y subcategorías realmente usadas en el catálogo -- se usa para
// llenar el menú desplegable de "a dónde lleva" en el editor de tarjetas y
// del menú, y se mantiene solo con lo que de verdad existe en tus productos.
app.get('/api/admin/categorias-disponibles', requireAuth, async (req, res) => {
  // Esta taxonomía (para clasificar productos) se arma en vivo desde el
  // mismo "Menú del sitio" -- así, si agregas una pestaña, columna o enlace
  // nuevo ahí, aparece aquí también de inmediato, sin tocar código.
  try {
    res.json(await construirTaxonomiaDesdeMenu());
  } catch (error) {
    console.error('GET /api/admin/categorias-disponibles:', error);
    // Si algo falla, al menos se ofrece la taxonomía base para no dejar los
    // formularios sin ninguna opción.
    res.json(TAXONOMIA_CATALOGO);
  }
});

// ---------------------------------------------------------------------------
// Panel de administración: cupones de descuento
// ---------------------------------------------------------------------------
app.get('/api/admin/cupones', requireAuth, async (req, res) => {
  try {
    const resultado = await pool.query(`
      SELECT c.*, cl.nombre AS cliente_nombre, cl.apellido AS cliente_apellido
      FROM cupones c
      LEFT JOIN clientes_cuenta cl ON cl.id = c.cliente_cuenta_id
      ORDER BY c.creado_en DESC
    `);
    res.json(resultado.rows);
  } catch (error) {
    console.error('GET /api/admin/cupones:', error);
    res.status(500).json({ error: 'No se pudieron cargar los cupones.' });
  }
});

app.post('/api/admin/cupones', requireAuth, async (req, res) => {
  const { codigo, tipo, valor, montoMinimo, usosMaximos, fechaInicio, fechaExpiracion } = req.body || {};
  if (!codigo?.trim()) return res.status(400).json({ error: 'El código es obligatorio.' });
  if (!['monto_fijo', 'porcentaje'].includes(tipo)) return res.status(400).json({ error: 'Tipo de cupón inválido.' });
  const valorNum = Number(valor);
  if (!Number.isFinite(valorNum) || valorNum <= 0) return res.status(400).json({ error: 'El valor debe ser un número mayor a 0.' });
  if (tipo === 'porcentaje' && valorNum > 100) return res.status(400).json({ error: 'Un descuento por porcentaje no puede ser mayor a 100.' });
  if (fechaInicio && fechaExpiracion && new Date(fechaInicio) > new Date(fechaExpiracion)) {
    return res.status(400).json({ error: 'La fecha de inicio no puede ser posterior a la de vencimiento.' });
  }
  try {
    const resultado = await pool.query(
      `INSERT INTO cupones (codigo, tipo, valor, monto_minimo, usos_maximos, fecha_inicio, fecha_expiracion)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        codigo.trim().toUpperCase(), tipo, valorNum,
        Number.isFinite(Number(montoMinimo)) ? Number(montoMinimo) : 0,
        Number.isFinite(Number(usosMaximos)) && Number(usosMaximos) > 0 ? Number(usosMaximos) : null,
        fechaInicio || null,
        fechaExpiracion || null
      ]
    );
    res.status(201).json(resultado.rows[0]);
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Ya existe un cupón con ese código.' });
    console.error('POST /api/admin/cupones:', error);
    res.status(500).json({ error: 'No se pudo crear el cupón.' });
  }
});

app.patch('/api/admin/cupones/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido.' });
  const campos = []; const valores = []; let i = 1;
  if (typeof req.body.activo === 'boolean') { campos.push(`activo=$${i++}`); valores.push(req.body.activo); }
  if (Number.isFinite(Number(req.body.valor)) && Number(req.body.valor) > 0) { campos.push(`valor=$${i++}`); valores.push(Number(req.body.valor)); }
  if (req.body.fechaInicio !== undefined) { campos.push(`fecha_inicio=$${i++}`); valores.push(req.body.fechaInicio || null); }
  if (req.body.fechaExpiracion !== undefined) { campos.push(`fecha_expiracion=$${i++}`); valores.push(req.body.fechaExpiracion || null); }
  if (campos.length === 0) return res.status(400).json({ error: 'No hay cambios para guardar.' });
  valores.push(id);
  try {
    const resultado = await pool.query(`UPDATE cupones SET ${campos.join(', ')} WHERE id=$${i} RETURNING *`, valores);
    if (resultado.rowCount === 0) return res.status(404).json({ error: 'Cupón no encontrado.' });
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('PATCH /api/admin/cupones/:id:', error);
    res.status(500).json({ error: 'No se pudo actualizar el cupón.' });
  }
});

app.delete('/api/admin/cupones/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido.' });
  try {
    const resultado = await pool.query('DELETE FROM cupones WHERE id=$1', [id]);
    if (resultado.rowCount === 0) return res.status(404).json({ error: 'Cupón no encontrado.' });
    res.json({ exito: true });
  } catch (error) {
    console.error('DELETE /api/admin/cupones/:id:', error);
    res.status(500).json({ error: 'No se pudo eliminar el cupón.' });
  }
});

// ---------------------------------------------------------------------------
// Panel de administración: configuración general de la tienda
// ---------------------------------------------------------------------------
// Config pública (solo lo que el storefront necesita mostrar -- nunca datos
// sensibles). El botón flotante de WhatsApp y textos de horario/entrega la usan.
app.get('/api/configuracion-publica', async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT clave, valor FROM configuracion WHERE clave = ANY($1::text[])`,
      [['whatsapp_numero', 'horario_atencion', 'tiempo_entrega', 'mensaje_footer', 'imagen_hero', 'imagen_categoria_no_disponible', 'instagram_url', 'facebook_url', 'tiktok_url', 'twitter_url', 'google_analytics_id', 'meta_pixel_id']]
    );
    const config = {};
    for (const fila of resultado.rows) config[fila.clave] = fila.valor;
    res.json(config);
  } catch (error) {
    console.error('GET /api/configuracion-publica:', error);
    res.status(500).json({ error: 'No se pudo cargar la configuración.' });
  }
});

app.get('/api/admin/configuracion', requireAuth, async (req, res) => {
  try {
    const resultado = await pool.query('SELECT clave, valor FROM configuracion');
    const config = {};
    for (const fila of resultado.rows) config[fila.clave] = fila.valor;
    res.json(config);
  } catch (error) {
    console.error('GET /api/admin/configuracion:', error);
    res.status(500).json({ error: 'No se pudo cargar la configuración.' });
  }
});

app.put('/api/admin/configuracion', requireAuth, requireAdmin, async (req, res) => {
  const entradas = Object.entries(req.body || {}).filter(([clave]) => typeof clave === 'string' && clave.trim());
  if (entradas.length === 0) return res.status(400).json({ error: 'No hay valores para guardar.' });
  try {
    for (const [clave, valor] of entradas) {
      await pool.query(
        `INSERT INTO configuracion (clave, valor) VALUES ($1,$2)
         ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor`,
        [clave.trim(), valor === null || valor === undefined ? null : String(valor)]
      );
    }
    const resultado = await pool.query('SELECT clave, valor FROM configuracion');
    const config = {};
    for (const fila of resultado.rows) config[fila.clave] = fila.valor;
    res.json(config);
  } catch (error) {
    console.error('PUT /api/admin/configuracion:', error);
    res.status(500).json({ error: 'No se pudo guardar la configuración.' });
  }
});

// Enlaces tipo /producto/123 abren index.html, que los detecta y muestra el
// producto correspondiente. Lo mismo para /estado/ciudad/categoria/... (ej.
// /tamaulipas/tampico/cumpleanos/flores-y-plantas/rosas): el navegador ya
// hizo su parte al no encontrar coincidencia en ninguna ruta de arriba, así
// que si "parece" una de estas rutas (2 a 5 tramos, sin puntos ni mayúsculas
// raras) se sirve el mismo cascarón y el front arma el filtro leyendo la URL.
// Cualquier otra ruta que no exista de verdad recibe un 404 real.
function pareceRutaUbicacionCategoria(ruta) {
  const tramos = ruta.replace(/^\/+|\/+$/g, '').split('/');
  if (tramos.length < 2 || tramos.length > 5) return false;
  return tramos.every(t => t.length > 0 && !t.includes('.'));
}

app.get(/.*/, (req, res) => {
  if (/^\/producto\/\d+\/?$/.test(req.path)) {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  if (req.path.replace(/\/+$/, '') === '/favoritos') {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  if (pareceRutaUbicacionCategoria(req.path)) {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

async function iniciar() {
  try {
    await inicializarDB();
    app.listen(port, () => console.log(`Reserva Floral ejecutándose en puerto ${port}`));
    // Revisa carritos abandonados cada 30 minutos mientras el servidor esté
    // corriendo (no hace falta un servicio aparte para esto).
    setInterval(revisarCarritosAbandonadosRF, 30 * 60 * 1000);
  } catch (error) {
    console.error('No se pudo inicializar la aplicación:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', async () => {
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await pool.end();
  process.exit(0);
});

iniciar();
