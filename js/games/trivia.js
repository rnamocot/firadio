// Pinoy Trivia: multiple-choice questions about the Philippines (food, places, history, culture, language,
// famous Pinoys) for every age. 15 seconds per question, 3 lives. Easy questions first, harder ones later.
// Points: easy 1, medium 2, hard 3, plus 1 for answering within 5 seconds. Ten right in a row wins back a life.
// The question bank ships with the game; no server calls besides the shared leaderboard.
FilGames.register("trivia", (api) => {
  // [level 1-3, category, question, right answer, wrong, wrong, wrong]
  const Q = [
    // ----- easy -----
    [1, "F", "What gives sinigang its classic sour taste?", "Sampalok (tamarind)", "Toyo (soy sauce)", "Asukal (sugar)", "Gata (coconut milk)"],
    [1, "F", "Balut is a boiled egg of which bird?", "Duck", "Chicken", "Quail", "Pigeon"],
    [1, "F", "What is halo-halo?", "A cold dessert with shaved ice", "A hot noodle soup", "A grilled meat dish", "A type of bread"],
    [1, "F", "Lechon is a whole roasted...", "Pig", "Cow", "Goat", "Chicken"],
    [1, "F", "Which dish is cooked in vinegar, soy sauce, garlic and bay leaf?", "Adobo", "Tinola", "Bulalo", "Halo-halo"],
    [1, "F", "Kare-kare is usually eaten with which side?", "Bagoong", "Ketchup", "Gravy", "Honey"],
    [1, "F", "Pancit is a dish made mainly of...", "Noodles", "Rice", "Bread", "Beans"],
    [1, "F", "Taho is silken tofu with arnibal (syrup) and...", "Sago pearls", "Ice cubes", "Corn flakes", "Cheese"],
    [1, "F", "Which bread is the classic Pinoy breakfast from the bakery?", "Pandesal", "Croissant", "Bagel", "Baguette"],
    [1, "F", "Tinola is a chicken soup usually cooked with...", "Green papaya", "Eggplant", "Okra", "Pumpkin"],
    [1, "F", "Puto is a...", "Steamed rice cake", "Fried fish", "Pork stew", "Fruit drink"],
    [1, "F", "What color is ube?", "Purple", "Yellow", "Green", "Red"],
    [1, "F", "Saba is a kind of...", "Banana", "Mango", "Coconut", "Rice"],
    [1, "F", "Turon is saba banana wrapped in a lumpia wrapper and...", "Fried with sugar", "Boiled in soup", "Frozen", "Grilled with soy sauce"],
    [1, "W", "What is \"talong\" in English?", "Eggplant", "Squash", "String beans", "Radish"],
    [1, "W", "What is \"kalabasa\" in English?", "Squash", "Cabbage", "Garlic", "Potato"],
    [1, "W", "What is \"sitaw\" in English?", "String beans", "Peanuts", "Corn", "Onion"],
    [1, "P", "What is the capital of the Philippines?", "Manila", "Quezon City", "Cebu City", "Davao City"],
    [1, "P", "The Chocolate Hills are in which province?", "Bohol", "Cebu", "Leyte", "Samar"],
    [1, "P", "Boracay Island is part of which province?", "Aklan", "Palawan", "Cebu", "Iloilo"],
    [1, "P", "Mayon Volcano is famous for its...", "Near-perfect cone shape", "Purple lava", "Location underwater", "Snowy peak"],
    [1, "P", "What is the largest island in the Philippines?", "Luzon", "Mindanao", "Samar", "Palawan"],
    [1, "P", "The Philippines has three main island groups: Luzon, Visayas and...", "Mindanao", "Palawan", "Samar", "Bohol"],
    [1, "P", "Which city is called the \"City of Pines\"?", "Baguio", "Tagaytay", "Davao", "Iloilo"],
    [1, "P", "Which city is famous for durian?", "Davao City", "Baguio City", "Vigan City", "Legazpi City"],
    [1, "P", "Which city is the \"Queen City of the South\"?", "Cebu City", "Davao City", "Iloilo City", "Zamboanga City"],
    [1, "P", "The Banaue Rice Terraces are in which province?", "Ifugao", "Benguet", "Cebu", "Palawan"],
    [1, "C", "Who is widely regarded as the national hero of the Philippines?", "José Rizal", "Andrés Bonifacio", "Emilio Aguinaldo", "Apolinario Mabini"],
    [1, "C", "What are the colors of the Philippine flag?", "Blue, red, white and yellow", "Green, white and red", "Red, white and black", "Blue, white and green"],
    [1, "C", "What is the national language of the Philippines?", "Filipino", "English", "Spanish", "Cebuano"],
    [1, "C", "The tinikling dance uses which props?", "Bamboo poles", "Coconut shells", "Fans", "Candles"],
    [1, "C", "The first jeepneys were made from...", "US military jeeps left after World War II", "Old trains", "Horse carriages", "Tricycles"],
    [1, "C", "What does \"mano po\" show?", "Respect for elders", "Saying goodbye to friends", "Asking for food", "Saying sorry"],
    [1, "C", "What is the currency of the Philippines?", "Peso", "Baht", "Ringgit", "Rupiah"],
    [1, "C", "What is the national bird of the Philippines?", "Philippine eagle", "Maya", "Kalaw (hornbill)", "Parrot"],
    [1, "C", "What is the national flower of the Philippines?", "Sampaguita", "Gumamela", "Rose", "Sunflower"],
    [1, "C", "What is the national tree of the Philippines?", "Narra", "Acacia", "Coconut", "Mango"],
    [1, "C", "In tumbang preso, what do players try to knock down?", "A can", "A coconut", "A bottle of water", "A stack of books"],
    [1, "C", "What animal is the kalabaw?", "Water buffalo", "Horse", "Goat", "Deer"],
    [1, "C", "\"Tsinelas\" are...", "Slippers", "Hats", "Bags", "Umbrellas"],
    [1, "C", "A bahay kubo is traditionally made of...", "Bamboo and nipa", "Concrete and steel", "Glass", "Bricks and tiles"],
    [1, "C", "Filipinos say the Christmas season starts in...", "September", "December", "November", "January"],
    [1, "C", "Noche Buena is the feast on...", "Christmas Eve", "New Year's Day", "Holy Week", "All Saints' Day"],
    [1, "C", "Jumping at midnight on New Year's Eve is believed to make kids...", "Taller", "Smarter", "Richer", "Faster"],
    [1, "C", "Filipinos often point at things using their...", "Lips", "Elbows", "Feet", "Ears"],
    [1, "C", "Juan Tamad is known for being...", "Lazy", "Brave", "Rich", "Strong"],
    [1, "C", "The Ibong Adarna is a magical...", "Bird", "Horse", "Fish", "Tree"],
    [1, "W", "What does \"salamat\" mean?", "Thank you", "Hello", "Goodbye", "Sorry"],
    [1, "W", "What does \"kain tayo\" mean?", "Let's eat", "Let's go", "Let's sleep", "Let's play"],
    [1, "W", "What does \"Pasko\" mean?", "Christmas", "Easter", "New Year", "Birthday"],
    [1, "W", "\"Kuya\" means...", "Older brother", "Uncle", "Grandfather", "Cousin"],
    [1, "W", "\"Ate\" means...", "Older sister", "Aunt", "Mother", "Best friend"],
    [1, "W", "\"Lolo\" means...", "Grandfather", "Father", "Uncle", "Older brother"],
    [1, "W", "What is \"pusa\" in English?", "Cat", "Dog", "Bird", "Pig"],
    [1, "W", "What is \"bituin\" in English?", "Star", "Moon", "Sun", "Cloud"],
    [1, "W", "What is \"buwan\" in English?", "Moon", "Star", "Sea", "Rain"],
    [1, "W", "A \"pasalubong\" is...", "A gift brought home from a trip", "A birthday party", "A school uniform", "A rice field"],
    [1, "S", "Which sport made Efren \"Bata\" Reyes a legend?", "Billiards", "Boxing", "Basketball", "Bowling"],
    [1, "S", "Manny Pacquiao became world famous in which sport?", "Boxing", "Basketball", "Swimming", "Tennis"],
    [1, "S", "Gilas Pilipinas is the national team for...", "Basketball", "Volleyball", "Football", "Baseball"],
    // ----- medium -----
    [2, "H", "Philippine Independence Day is celebrated on...", "June 12", "July 4", "August 21", "December 30"],
    [2, "H", "In what year was Philippine independence from Spain declared?", "1898", "1946", "1521", "1986"],
    [2, "H", "Where was independence declared in 1898?", "Kawit, Cavite", "Malolos, Bulacan", "Intramuros, Manila", "Cebu City"],
    [2, "H", "In what year did Magellan's expedition reach the Philippines?", "1521", "1492", "1565", "1898"],
    [2, "H", "Whose forces defeated Magellan at the Battle of Mactan?", "Lapu-Lapu", "Rajah Humabon", "Sultan Kudarat", "Diego Silang"],
    [2, "H", "In what year was the EDSA People Power Revolution?", "1986", "1972", "1983", "2001"],
    [2, "H", "Who founded the Katipunan?", "Andrés Bonifacio", "José Rizal", "Emilio Jacinto", "Marcelo H. del Pilar"],
    [2, "H", "Who is recognized as the first President of the Philippines?", "Emilio Aguinaldo", "Manuel L. Quezon", "José P. Laurel", "Sergio Osmeña"],
    [2, "H", "Which novel did José Rizal write?", "Noli Me Tangere", "Florante at Laura", "Ibong Adarna", "Banaag at Sikat"],
    [2, "H", "Who wrote \"Florante at Laura\"?", "Francisco Balagtas", "José Rizal", "Andrés Bonifacio", "Emilio Jacinto"],
    [2, "H", "Rizal was executed in Bagumbayan, known today as...", "Rizal Park (Luneta)", "Intramuros", "Fort Santiago", "Malacañang"],
    [2, "H", "Rizal Day is observed on...", "December 30", "June 19", "November 30", "June 12"],
    [2, "H", "The Philippines was named after which Spanish king?", "Philip II", "Ferdinand VII", "Charles V", "Alfonso XIII"],
    [2, "H", "In what year did the United States recognize Philippine independence?", "1946", "1935", "1898", "1965"],
    [2, "H", "Who is called the \"Mother of the Katipunan\"?", "Melchora Aquino (Tandang Sora)", "Gabriela Silang", "Teresa Magbanua", "Josefa Llanes Escoda"],
    [2, "H", "Who was the first female President of the Philippines?", "Corazon Aquino", "Gloria Macapagal Arroyo", "Imelda Marcos", "Leni Robredo"],
    [2, "H", "Martial law was declared nationwide by Ferdinand Marcos in...", "1972", "1965", "1986", "1981"],
    [2, "H", "Spain ruled the Philippines for about how many years?", "333", "100", "48", "500"],
    [2, "H", "\"Intramuros\" means...", "Within the walls", "Old city", "Church grounds", "By the sea"],
    [2, "P", "What is the longest river in the Philippines?", "Cagayan River", "Pasig River", "Agusan River", "Pampanga River"],
    [2, "P", "What is the highest mountain in the Philippines?", "Mount Apo", "Mount Pulag", "Mayon Volcano", "Mount Pinatubo"],
    [2, "P", "What is the largest lake in the Philippines?", "Laguna de Bay", "Taal Lake", "Lake Lanao", "Lake Sebu"],
    [2, "P", "Taal Volcano is in which province?", "Batangas", "Cavite", "Laguna", "Quezon"],
    [2, "P", "The heritage city of Vigan is in which province?", "Ilocos Sur", "Ilocos Norte", "La Union", "Pangasinan"],
    [2, "P", "The Puerto Princesa Underground River is in...", "Palawan", "Bohol", "Siargao", "Samar"],
    [2, "P", "Which volcano had a huge eruption in 1991?", "Mount Pinatubo", "Mayon Volcano", "Taal Volcano", "Kanlaon Volcano"],
    [2, "P", "The Hundred Islands are in which province?", "Pangasinan", "Palawan", "Batangas", "Zambales"],
    [2, "P", "The Sinulog Festival is held in...", "Cebu City", "Davao City", "Bacolod City", "Iloilo City"],
    [2, "P", "The MassKara Festival is held in...", "Bacolod City", "Cebu City", "Baguio City", "Davao City"],
    [2, "P", "Panagbenga, the flower festival, is held in...", "Baguio City", "Tagaytay City", "Davao City", "Vigan City"],
    [2, "P", "The Ati-Atihan Festival is held in...", "Kalibo, Aklan", "Lucban, Quezon", "Vigan, Ilocos Sur", "Cebu City"],
    [2, "P", "The Kadayawan Festival is held in...", "Davao City", "Cebu City", "Iloilo City", "Zamboanga City"],
    [2, "P", "Siargao's famous surf break is called...", "Cloud 9", "Big Wave", "Blue Lagoon", "Paradise Point"],
    [2, "P", "The San Juanico Bridge connects Leyte and...", "Samar", "Cebu", "Bohol", "Biliran"],
    [2, "P", "Tarsiers are a famous sight in which province?", "Bohol", "Cebu", "Batangas", "Ilocos Norte"],
    [2, "P", "Magellan's Cross is in...", "Cebu City", "Manila", "Iloilo City", "Davao City"],
    [2, "P", "Guimaras is famous for its sweet...", "Mangoes", "Pineapples", "Bananas", "Coconuts"],
    [2, "P", "Pili nuts mostly come from which region?", "Bicol", "Ilocos", "Central Luzon", "Caraga"],
    [2, "F", "Pinakbet is a vegetable dish from which region?", "Ilocos", "Bicol", "Western Visayas", "Mindanao"],
    [2, "F", "Sisig comes from which province?", "Pampanga", "Bulacan", "Batangas", "Cebu"],
    [2, "F", "Piaya is a specialty of...", "Bacolod (Negros Occidental)", "Baguio", "Vigan", "Davao"],
    [2, "F", "Bagoong alamang is made from tiny...", "Shrimp", "Crabs", "Squid", "Clams"],
    [2, "F", "Dinuguan is a stew made with pork and...", "Pig's blood", "Coconut milk", "Peanut sauce", "Tomato sauce"],
    [2, "F", "Kinilaw is raw fish \"cooked\" in...", "Vinegar", "Hot oil", "Coconut milk", "Soy sauce"],
    [2, "F", "Bicol Express is pork cooked in coconut milk and...", "Chili", "Chocolate", "Pineapple", "Cheese"],
    [2, "F", "Pastillas are sweets made mainly from...", "Milk", "Rice", "Coconut", "Corn"],
    [2, "F", "In English, bangus is...", "Milkfish", "Tuna", "Tilapia", "Catfish"],
    [2, "F", "Many Filipinos prepare how many round fruits for New Year's Eve?", "12", "7", "3", "20"],
    [2, "F", "Media Noche is the feast on...", "New Year's Eve", "Christmas Eve", "Easter Sunday", "All Souls' Day"],
    [2, "C", "How many dawn Masses make up Simbang Gabi?", "9", "7", "12", "3"],
    [2, "C", "How many rays does the sun on the Philippine flag have?", "8", "3", "7", "12"],
    [2, "C", "The three stars on the flag stand for...", "Luzon, Visayas and Mindanao", "Faith, hope and love", "Three heroes", "Three wars"],
    [2, "C", "The classic \"bayanihan\" picture shows neighbors carrying a...", "House", "Boat", "Carabao", "Church bell"],
    [2, "C", "A \"harana\" is...", "Serenading someone at night", "A harvest festival", "A wedding dance", "A fishing trip"],
    [2, "C", "\"Pamamanhikan\" is when...", "The groom's family asks for the bride's hand", "A baby is baptized", "A family moves house", "Students graduate"],
    [2, "C", "Baybayin is...", "An ancient Filipino script", "A folk dance", "A fishing boat", "A rice dish"],
    [2, "C", "A kundiman is a traditional...", "Love song", "War dance", "Rice cake", "Boat race"],
    [2, "C", "What is the national sport by law (since 2009)?", "Arnis", "Basketball", "Sipa", "Sabong"],
    [2, "C", "Who composed the music of \"Lupang Hinirang\"?", "Julián Felipe", "José Palma", "Nicanor Abelardo", "Lucio San Pedro"],
    [2, "C", "Who created the comics superheroine Darna?", "Mars Ravelo", "Carlo J. Caparas", "Francisco Coching", "Pablo Gomez"],
    [2, "C", "In the legend, Malakas and Maganda came out of a...", "Bamboo", "Coconut", "Rock", "Seashell"],
    [2, "C", "Bathala was the supreme god of the...", "Tagalogs", "Spaniards", "Chinese traders", "Japanese"],
    [2, "C", "The Pahiyas Festival is held in...", "Lucban, Quezon", "Kalibo, Aklan", "Vigan, Ilocos Sur", "Boac, Marinduque"],
    [2, "C", "The Moriones Festival is held during Holy Week in...", "Marinduque", "Bohol", "Antique", "Romblon"],
    [2, "C", "The Black Nazarene procession is held in...", "Quiapo, Manila", "Cebu City", "Naga City", "Baclaran, Parañaque"],
    [2, "W", "\"Kilig\" is the feeling of...", "Giddy excitement from romance", "Being very hungry", "Being sleepy", "Fear of the dark"],
    [2, "W", "\"Gigil\" is the urge to...", "Squeeze something very cute", "Sleep all day", "Sing loudly", "Run away"],
    [2, "W", "\"Bahala na\" roughly means...", "Come what may", "Hurry up", "Be careful", "Good morning"],
    [2, "W", "A balikbayan box is sent by...", "Filipinos abroad to family back home", "Schools to students", "Farmers to the city", "The post office to banks"],
    [2, "S", "Who won the Philippines' first Olympic gold medal?", "Hidilyn Diaz", "Carlos Yulo", "Onyok Velasco", "Nesthy Petecio"],
    [2, "S", "Carlos Yulo won two Olympic golds in 2024 in...", "Gymnastics", "Boxing", "Weightlifting", "Swimming"],
    [2, "S", "Who won Miss Universe 2018?", "Catriona Gray", "Pia Wurtzbach", "Gloria Diaz", "Margie Moran"],
    [2, "S", "Who was the first Filipina Miss Universe (1969)?", "Gloria Diaz", "Margie Moran", "Pia Wurtzbach", "Catriona Gray"],
    [2, "S", "Lea Salonga won a Tony Award for...", "Miss Saigon", "Les Misérables", "The Lion King", "Mulan"],
    [2, "S", "Who is known as \"Asia's Songbird\"?", "Regine Velasquez", "Sarah Geronimo", "Lani Misalucha", "Kuh Ledesma"],
    [2, "S", "Who is known as the \"Comedy King\"?", "Dolphy", "Vic Sotto", "Babalu", "Redford White"],
    [2, "S", "Who is known as \"Da King\" of Philippine movies?", "Fernando Poe Jr.", "Joseph Estrada", "Robin Padilla", "Lito Lapid"],
    [2, "S", "Who is known as the \"Superstar\" of Philippine showbiz?", "Nora Aunor", "Vilma Santos", "Sharon Cuneta", "Maricel Soriano"],
    [2, "S", "Which band sang \"Ang Huling El Bimbo\"?", "Eraserheads", "Rivermaya", "Parokya ni Edgar", "Sugarfree"],
    [2, "S", "Freddie Aguilar's most famous song is...", "Anak", "Bayan Ko", "Kanlungan", "Tuwing Umuulan"],
    [2, "S", "Paeng Nepomuceno is a world champion in...", "Bowling", "Billiards", "Chess", "Boxing"],
    // ----- hard -----
    [3, "H", "Which President served the longest term in office?", "Ferdinand Marcos", "Manuel L. Quezon", "Gloria Macapagal Arroyo", "Ramon Magsaysay"],
    [3, "H", "The current Philippine Constitution is from...", "1987", "1973", "1935", "1899"],
    [3, "H", "Who sewed the first Philippine flag in Hong Kong?", "Marcela Agoncillo", "Gregoria de Jesus", "Melchora Aquino", "Trinidad Tecson"],
    [3, "H", "The 8 rays of the flag's sun stand for...", "The first 8 provinces to revolt against Spain", "8 national heroes", "8 major languages", "8 regions"],
    [3, "H", "The priests Gomburza were executed in...", "1872", "1896", "1898", "1863"],
    [3, "H", "Who founded La Liga Filipina in 1892?", "José Rizal", "Andrés Bonifacio", "Graciano López Jaena", "Apolinario Mabini"],
    [3, "H", "The First Philippine Republic was inaugurated in...", "Malolos, Bulacan", "Kawit, Cavite", "Biak-na-Bato", "Tarlac"],
    [3, "H", "Who is the young general known as the hero of Tirad Pass?", "Gregorio del Pilar", "Antonio Luna", "Emilio Jacinto", "Miguel Malvar"],
    [3, "H", "Which American commodore won the Battle of Manila Bay in 1898?", "George Dewey", "Douglas MacArthur", "Arthur MacArthur", "Matthew Perry"],
    [3, "H", "The Bataan Death March happened in...", "1942", "1945", "1898", "1935"],
    [3, "H", "Where did MacArthur land when he returned in 1944?", "Leyte", "Bataan", "Corregidor", "Lingayen"],
    [3, "H", "Who is called the \"Sublime Paralytic\"?", "Apolinario Mabini", "Emilio Jacinto", "Marcelo H. del Pilar", "Antonio Luna"],
    [3, "H", "\"Plaridel\" was the pen name of...", "Marcelo H. del Pilar", "José Rizal", "Antonio Luna", "Graciano López Jaena"],
    [3, "H", "Which was one of José Rizal's pen names?", "Laong Laan", "Plaridel", "Taga-ilog", "Dimas-ilaw"],
    [3, "H", "Where was José Rizal born?", "Calamba, Laguna", "Dapitan, Zamboanga", "Tondo, Manila", "Kawit, Cavite"],
    [3, "H", "Andrés Bonifacio's wife was...", "Gregoria de Jesus", "Josephine Bracken", "Marcela Agoncillo", "Hilaria del Rosario"],
    [3, "H", "At the Cry of Pugad Lawin (1896), the Katipuneros tore up their...", "Cedulas", "Flags", "Bibles", "Land titles"],
    [3, "H", "Who led the Commonwealth as its first President?", "Manuel L. Quezon", "Sergio Osmeña", "Emilio Aguinaldo", "Manuel Roxas"],
    [3, "H", "Who is called the \"Father of the National Language\"?", "Manuel L. Quezon", "José Rizal", "Lope K. Santos", "Francisco Balagtas"],
    [3, "H", "Ninoy Aquino was assassinated at the Manila airport in...", "1983", "1972", "1986", "1980"],
    [3, "H", "Super Typhoon Yolanda (Haiyan) hit the Visayas in...", "2013", "2009", "2016", "2006"],
    [3, "H", "Which pope celebrated a giant Mass in Rizal Park in 2015?", "Pope Francis", "Pope John Paul II", "Pope Benedict XVI", "Pope Paul VI"],
    [3, "H", "The national anthem was first titled...", "Marcha Nacional Filipina", "Bayan Ko", "Lupang Sinilangan", "Himno de Manila"],
    [3, "P", "What is the northernmost province of the Philippines?", "Batanes", "Ilocos Norte", "Cagayan", "Apayao"],
    [3, "P", "What is the southernmost province of the Philippines?", "Tawi-Tawi", "Sulu", "Sarangani", "Davao Occidental"],
    [3, "P", "What is the largest province by land area?", "Palawan", "Isabela", "Bukidnon", "Quezon"],
    [3, "P", "Mount Pulag is the highest peak of...", "Luzon", "Mindanao", "Visayas", "Palawan"],
    [3, "P", "About how many islands does the Philippines have?", "7,641", "1,707", "3,500", "12,000"],
    [3, "P", "The tamaraw is found only on which island?", "Mindoro", "Palawan", "Negros", "Panay"],
    [3, "P", "Donsol, Sorsogon is famous for swimming with...", "Whale sharks (butanding)", "Dolphins", "Sea turtles", "Manta rays"],
    [3, "P", "Tubbataha Reefs Natural Park belongs to which province?", "Palawan", "Sulu", "Antique", "Negros Oriental"],
    [3, "F", "Puto bumbong gets its purple color from...", "Pirurutong (purple glutinous rice)", "Ube jam", "Purple corn", "Grape juice"],
    [3, "F", "Kesong puti is a white cheese traditionally made from...", "Carabao's milk", "Goat's milk", "Soy milk", "Coconut milk"],
    [3, "F", "During Pahiyas, houses are decorated with colorful rice wafers called...", "Kiping", "Pilipit", "Ampaw", "Apas"],
    [3, "C", "The Sinulog Festival honors the...", "Santo Niño", "Black Nazarene", "Our Lady of Peñafrancia", "San Isidro Labrador"],
    [3, "C", "Which is the oldest existing university in Asia, founded in Manila in 1611?", "University of Santo Tomas", "University of the Philippines", "Ateneo de Manila", "San Beda University"],
    [3, "C", "Juan Luna's \"Spoliarium\" won a gold medal in 1884 in...", "Madrid", "Paris", "Rome", "Barcelona"],
    [3, "C", "Fernando Amorsolo is a National Artist famous for...", "Paintings of sunlit rural scenes", "Bronze sculptures", "Opera music", "Folk dances"],
    [3, "C", "Who wrote the \"Lola Basyang\" stories?", "Severino Reyes", "Mars Ravelo", "Nick Joaquin", "Amado V. Hernandez"],
    [3, "C", "The Philippine eagle is also known as the...", "Monkey-eating eagle", "Fish-eating eagle", "Golden eagle", "Sea eagle"],
    [3, "S", "The PBA, Asia's first pro basketball league, was founded in...", "1975", "1965", "1985", "1990"],
    [3, "S", "Who is known as the \"Megastar\"?", "Sharon Cuneta", "Nora Aunor", "Vilma Santos", "Pops Fernandez"],
    [3, "S", "Pia Wurtzbach was crowned Miss Universe in...", "2015", "2013", "2017", "2018"],
  ].map(([lv, cat, q, ...a]) => ({ lv, cat, q, a }));

  const CATS = {
    F: ["Pagkain · Food", "#ff9f43"], P: ["Lugar · Places", "#4cbf5a"], H: ["Kasaysayan · History", "#5aa9ff"],
    C: ["Kultura · Culture", "#b07cf0"], W: ["Wika · Words", "#ff7eb6"], S: ["Sikat · Famous Pinoys", "#ffc93c"],
  };
  const TIME = 15, LIVES = 3, REVEAL = 1.4;

  let W, H, lives, streak, qn, cur, opts, rightIx, picked, timeLeft, reveal, focus, used, t = 0, flash, ending;

  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function tierFor(n) { // easy first, then mixed, then mostly hard
    const r = Math.random();
    if (n < 6) return 1;
    if (n < 14) return r < 0.55 ? 1 : 2;
    if (n < 24) return r < 0.15 ? 1 : r < 0.75 ? 2 : 3;
    return r < 0.45 ? 2 : 3;
  }
  function nextQ() {
    const want = tierFor(qn);
    const order = [want, ...[1, 2, 3].filter((x) => x !== want).sort((a, b) => Math.abs(a - want) - Math.abs(b - want))];
    let pool = [];
    for (const lv of order) { pool = Q.filter((q, i) => q.lv === lv && !used.has(i)); if (pool.length) break; }
    if (!pool.length) { cur = null; return false; }
    cur = pool[Math.floor(Math.random() * pool.length)];
    used.add(Q.indexOf(cur));
    opts = shuffle(cur.a.map((text, i) => ({ text, right: i === 0 })));
    rightIx = opts.findIndex((o) => o.right);
    picked = -1; timeLeft = TIME; reveal = 0; focus = -1; qn++;
    return true;
  }

  // ---------- layout ----------
  const font = (ctx, w, px) => { ctx.font = `${w} ${px}px Archivo, system-ui, sans-serif`; };
  function wrap(ctx, text, maxW) {
    const words = text.split(" "), lines = [];
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }
  function boxes() {
    const pad = 16, gap = 10, bw = Math.min(W - pad * 2, 520), bh = H < 600 ? 50 : 56;
    const x = (W - bw) / 2, bottom = H - 18;
    return [0, 1, 2, 3].map((i) => ({ x, y: bottom - (4 - i) * (bh + gap) + gap, w: bw, h: bh }));
  }
  function choose(i) {
    if (reveal || picked >= 0 || !cur || ending || !api.playing) return;
    picked = i;
    api.action();
    reveal = REVEAL;
    const b = boxes()[i];
    if (i === rightIx) {
      const pts = cur.lv, fast = TIME - timeLeft <= 5;
      api.add(pts, b.x + b.w / 2, b.y - 4, fast ? `+${pts} Bilis! +1` : `+${pts}`, fast);
      if (fast) api.add(1);
      api.burst(b.x + b.w / 2, b.y + b.h / 2, 14, ["#4cbf5a", "#fff", "#ffc93c"], 150, 500, 3);
      streak++;
      if (streak % 10 === 0 && lives < LIVES) { lives++; flash = { text: `${streak} in a row! +1 life`, life: 1.6 }; }
      else if (streak % 5 === 0) flash = { text: `${streak} in a row!`, life: 1.3 };
    } else miss();
  }
  function miss() {
    lives--; streak = 0;
    api.shake(6); api.vibrate(40);
  }

  return {
    reset() { W = api.W; H = api.H; lives = LIVES; streak = 0; qn = 0; used = new Set(); flash = null; ending = false; t = 0; nextQ(); },
    resize() { W = api.W; H = api.H; },
    idle(dt) { t += dt; },
    down(x, y, key) {
      if (key) { if (focus >= 0) choose(focus); return; }
      boxes().forEach((b, i) => { if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) choose(i); });
    },
    key(code, isDown) {
      if (!isDown || reveal || !cur) return;
      if (code === "ArrowDown" || code === "ArrowRight") focus = (focus + 1) % 4;
      else if (code === "ArrowLeft") focus = (focus + 3) % 4;
    },
    step(dt) {
      t += dt;
      if (flash && (flash.life -= dt) <= 0) flash = null;
      if (!cur || ending || !api.playing) return;
      if (reveal) {
        if ((reveal -= dt) <= 0) {
          reveal = 0;
          if (lives <= 0) { ending = true; api.over("Game over! Your score"); return; }
          if (!nextQ()) { ending = true; api.over("You answered them all! Score"); }
        }
        return;
      }
      if ((timeLeft -= dt) <= 0) { timeLeft = 0; picked = -2; reveal = REVEAL; miss(); flash = { text: "Time's up!", life: 1.2 }; }
    },
    draw(ctx) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#1c2a5c"); g.addColorStop(1, "#0f1530");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // soft sun rays from the flag behind everything
      ctx.save(); ctx.translate(W / 2, H * 0.42); ctx.rotate(t * 0.05);
      ctx.fillStyle = "rgba(255,201,60,.035)";
      for (let i = 0; i < 8; i++) { ctx.rotate(Math.PI / 4); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-40, -Math.max(W, H)); ctx.lineTo(40, -Math.max(W, H)); ctx.fill(); }
      ctx.restore();
      if (!cur) return;
      const bx = boxes(), top = 122, qBottom = bx[0].y - 14;
      const cw = Math.min(W - 32, 520), cx = (W - cw) / 2;
      // category chip and difficulty
      const [label, col] = CATS[cur.cat];
      font(ctx, 800, 11.5);
      const lw = ctx.measureText(label.toUpperCase()).width + 20;
      ctx.fillStyle = col; api.rr(cx, top, lw, 22, 11); ctx.fill();
      ctx.fillStyle = "#10172a"; ctx.textAlign = "left"; ctx.fillText(label.toUpperCase(), cx + 10, top + 15);
      ctx.textAlign = "right"; ctx.fillStyle = "rgba(255,255,255,.75)";
      ctx.fillText(`${"★".repeat(cur.lv)}${"☆".repeat(3 - cur.lv)}  +${cur.lv}`, cx + cw, top + 15);
      // timer bar
      const k = timeLeft / TIME, ty = top + 32;
      ctx.fillStyle = "rgba(255,255,255,.1)"; api.rr(cx, ty, cw, 6, 3); ctx.fill();
      ctx.fillStyle = k > 0.5 ? "#4cbf5a" : k > 0.25 ? "#ffc93c" : "#ff6b6b";
      api.rr(cx, ty, cw * k, 6, 3); ctx.fill();
      // question card
      const cardY = ty + 16, cardH = Math.max(70, qBottom - cardY);
      ctx.fillStyle = "rgba(255,255,255,.06)"; api.rr(cx, cardY, cw, cardH, 18); ctx.fill();
      let size = 21;
      font(ctx, 800, size);
      let lines = wrap(ctx, cur.q, cw - 36);
      while (lines.length * size * 1.3 > cardH - 24 && size > 14) { size--; font(ctx, 800, size); lines = wrap(ctx, cur.q, cw - 36); }
      ctx.fillStyle = "#fff"; ctx.textAlign = "center";
      const lh = size * 1.3, y0 = cardY + cardH / 2 - (lines.length * lh) / 2 + size * 0.95;
      lines.forEach((l, i) => ctx.fillText(l, W / 2, y0 + i * lh));
      // answers
      bx.forEach((b, i) => {
        const o = opts[i], showRight = reveal && i === rightIx, showWrong = reveal && i === picked && i !== rightIx;
        let fill = "rgba(255,255,255,.09)", stroke = "rgba(255,255,255,.14)";
        if (showRight) { fill = "rgba(76,191,90,.85)"; stroke = "#7be08a"; }
        else if (showWrong) { fill = "rgba(230,57,70,.85)"; stroke = "#ff8f99"; }
        else if (i === focus) stroke = "#ffc93c";
        ctx.fillStyle = fill; api.rr(b.x, b.y, b.w, b.h, 14); ctx.fill();
        ctx.strokeStyle = stroke; ctx.lineWidth = i === focus && !reveal ? 2.5 : 1.5; api.rr(b.x, b.y, b.w, b.h, 14); ctx.stroke();
        // letter badge
        ctx.fillStyle = showRight || showWrong ? "rgba(255,255,255,.25)" : "rgba(255,201,60,.18)";
        ctx.beginPath(); ctx.arc(b.x + 24, b.y + b.h / 2, 13, 0, 7); ctx.fill();
        ctx.fillStyle = showRight || showWrong ? "#fff" : "#ffc93c"; font(ctx, 800, 13); ctx.textAlign = "center";
        ctx.fillText(showRight ? "✓" : showWrong ? "✗" : "ABCD"[i], b.x + 24, b.y + b.h / 2 + 4.5);
        // text, up to 2 lines
        let s = 15.5; font(ctx, 700, s);
        let ls = wrap(ctx, o.text, b.w - 60);
        while (ls.length > 2 && s > 11) { s -= 0.5; font(ctx, 700, s); ls = wrap(ctx, o.text, b.w - 60); }
        ctx.fillStyle = "#fff"; ctx.textAlign = "left";
        const l2 = s * 1.2, yy = b.y + b.h / 2 - ((ls.length - 1) * l2) / 2 + s * 0.35;
        ls.slice(0, 2).forEach((l, j) => ctx.fillText(l, b.x + 46, yy + j * l2));
      });
      if (flash) { ctx.globalAlpha = Math.min(1, flash.life * 2); api.text(flash.text, W / 2, cardY + cardH + 2, 17, "#ffc93c", 800); ctx.globalAlpha = 1; }
    },
    hud(ctx) {
      font(ctx, 400, 18); ctx.textAlign = "left";
      for (let i = 0; i < LIVES; i++) { ctx.fillStyle = i < lives ? "#ff5a6a" : "rgba(255,255,255,.2)"; ctx.fillText("♥", 14 + i * 20, 32); }
      api.text(`Q${qn}`, W - 16, 30, 14, "#fff", 800, "right");
      if (streak >= 3) api.text(`🔥 ${streak}`, W - 16, 50, 13, "#ffc93c", 800, "right");
    },
  };
});
