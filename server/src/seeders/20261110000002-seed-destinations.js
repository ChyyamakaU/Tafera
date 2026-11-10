'use strict'

// Seed images use fixed, direct Unsplash URLs as temporary photography. No
// runtime image API is called. These rows can later be replaced with Cloudinary
// assets without changing the destination records or public API contract.
const SEEDED_AT = new Date('2026-01-15T00:00:00.000Z')

const DESTINATIONS = [
  {
    id: 'd0000000-0000-4000-8000-000000000001',
    name: 'Kyoto',
    slug: 'kyoto-japan',
    country: 'Japan',
    state: 'Kyoto',
    description:
      'Kyoto is the former imperial capital of Japan, known for classical Buddhist temples, gardens, imperial palaces, Shinto shrines and traditional wooden houses. Its historic districts reward slow walks between tea houses and riverside paths.',
    location: 'Kyoto, Japan',
    latitude: 35.0116,
    longitude: 135.7681,
    featured: true,
    status: 'published',
    created_by: null,
    created_at: SEEDED_AT,
    updated_at: SEEDED_AT,
  },
  {
    id: 'd0000000-0000-4000-8000-000000000002',
    name: 'Santorini',
    slug: 'santorini-greece',
    country: 'Greece',
    state: 'South Aegean',
    description:
      'Santorini is a volcanic island in the Cyclades, famous for whitewashed villages perched above the caldera, blue-domed churches and sunsets over the Aegean Sea. The island pairs quiet village lanes with dramatic coastal views.',
    location: 'Santorini, Greece',
    latitude: 36.3932,
    longitude: 25.4615,
    featured: true,
    status: 'published',
    created_by: null,
    created_at: SEEDED_AT,
    updated_at: SEEDED_AT,
  },
  {
    id: 'd0000000-0000-4000-8000-000000000003',
    name: 'Banff',
    slug: 'banff-canada',
    country: 'Canada',
    state: 'Alberta',
    description:
      'Banff sits in the heart of the Canadian Rockies, surrounded by turquoise lakes, glacier-fed rivers and high alpine trails. It is a base for hiking, wildlife watching and scenic drives through Banff National Park.',
    location: 'Banff National Park, Alberta, Canada',
    latitude: 51.4968,
    longitude: -115.9281,
    featured: true,
    status: 'published',
    created_by: null,
    created_at: SEEDED_AT,
    updated_at: SEEDED_AT,
  },
  {
    id: 'd0000000-0000-4000-8000-000000000004',
    name: 'Bali',
    slug: 'bali-indonesia',
    country: 'Indonesia',
    state: 'Bali',
    description:
      'Bali combines terraced rice fields, Hindu temples, surf beaches and dense jungle. The island offers both lively coastal towns and quieter inland villages, making it suitable for adventure, culture and long stays.',
    location: 'Bali, Indonesia',
    latitude: -8.4095,
    longitude: 115.1889,
    featured: true,
    status: 'published',
    created_by: null,
    created_at: SEEDED_AT,
    updated_at: SEEDED_AT,
  },
  {
    id: 'd0000000-0000-4000-8000-000000000005',
    name: 'Lisbon',
    slug: 'lisbon-portugal',
    country: 'Portugal',
    state: 'Lisbon',
    description:
      'Lisbon spreads across steep hills above the Tagus River, with tiled facades, historic tram lines, miradouros and a compact walkable centre. Day trips to nearby beaches and palaces are part of the city experience.',
    location: 'Lisbon, Portugal',
    latitude: 38.7223,
    longitude: -9.1393,
    featured: false,
    status: 'published',
    created_by: null,
    created_at: SEEDED_AT,
    updated_at: SEEDED_AT,
  },
  {
    id: 'd0000000-0000-4000-8000-000000000006',
    name: 'Marrakech',
    slug: 'marrakech-morocco',
    country: 'Morocco',
    state: 'Marrakesh-Safi',
    description:
      'Marrakech blends bustling souks and the medina with quiet riad courtyards and gardens. The city is a gateway to the Atlas Mountains and the desert, with food, craft and architecture at its centre.',
    location: 'Marrakech, Morocco',
    latitude: 31.6295,
    longitude: -7.9811,
    featured: false,
    status: 'published',
    created_by: null,
    created_at: SEEDED_AT,
    updated_at: SEEDED_AT,
  },
  {
    id: 'd0000000-0000-4000-8000-000000000007',
    name: 'Queenstown',
    slug: 'queenstown-new-zealand',
    country: 'New Zealand',
    state: 'Otago',
    description:
      'Queenstown sits beside Lake Wakatipu beneath the Remarkables mountain range. It is known for hiking, skiing, lake cruises and adventure sports, with vineyards and small towns along the surrounding valleys.',
    location: 'Queenstown, New Zealand',
    latitude: -45.0312,
    longitude: 168.6626,
    featured: false,
    status: 'published',
    created_by: null,
    created_at: SEEDED_AT,
    updated_at: SEEDED_AT,
  },
  {
    id: 'd0000000-0000-4000-8000-000000000008',
    name: 'Cape Town',
    slug: 'cape-town-south-africa',
    country: 'South Africa',
    state: 'Western Cape',
    description:
      'Cape Town wraps around Table Mountain and the Atlantic seaboard, combining beaches, vineyards, hiking trails and a complex cultural history. The city works as a base for exploring the Cape Peninsula and nearby winelands.',
    location: 'Cape Town, South Africa',
    latitude: -33.9249,
    longitude: 18.4241,
    featured: false,
    status: 'published',
    created_by: null,
    created_at: SEEDED_AT,
    updated_at: SEEDED_AT,
  },
  {
    id: 'd0000000-0000-4000-8000-000000000009',
    name: 'Reykjavik',
    slug: 'reykjavik-iceland',
    country: 'Iceland',
    state: 'Capital Region',
    description:
      'Reykjavik is a compact coastal capital and a starting point for Iceland’s lava fields, hot springs and glacier landscapes. The city itself offers Nordic design, live music and easy access to the Golden Circle.',
    location: 'Reykjavik, Iceland',
    latitude: 64.1466,
    longitude: -21.9426,
    featured: false,
    status: 'published',
    created_by: null,
    created_at: SEEDED_AT,
    updated_at: SEEDED_AT,
  },
  {
    id: 'd0000000-0000-4000-8000-000000000010',
    name: 'Cusco',
    slug: 'cusco-peru',
    country: 'Peru',
    state: 'Cusco',
    description:
      'Cusco was the historic capital of the Inca Empire and remains a high-altitude hub for exploring the Sacred Valley and Machu Picchu. Colonial architecture sits alongside Inca stonework, markets and mountain trails.',
    location: 'Cusco, Peru',
    latitude: -13.5319,
    longitude: -71.9675,
    featured: false,
    status: 'published',
    created_by: null,
    created_at: SEEDED_AT,
    updated_at: SEEDED_AT,
  },
]

const DESTINATION_IMAGES = [
  {
    id: 'd1000000-0000-4000-8000-000000000001',
    destination_id: 'd0000000-0000-4000-8000-000000000001',
    image_url:
      'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1600&q=80',
    public_id: 'tafera/seed/destinations/kyoto-1',
    alt_text: 'Traditional street and temple roofs in Kyoto',
    display_order: 0,
    is_cover: true,
    created_at: SEEDED_AT,
    updated_at: SEEDED_AT,
  },
  {
    id: 'd1000000-0000-4000-8000-000000000002',
    destination_id: 'd0000000-0000-4000-8000-000000000001',
    image_url:
      'https://images.unsplash.com/photo-1545569341-9eb8b30979d9?auto=format&fit=crop&w=1600&q=80',
    public_id: 'tafera/seed/destinations/kyoto-2',
    alt_text: 'Pagoda rising above Kyoto during autumn',
    display_order: 1,
    is_cover: false,
    created_at: SEEDED_AT,
    updated_at: SEEDED_AT,
  },
  {
    id: 'd1000000-0000-4000-8000-000000000003',
    destination_id: 'd0000000-0000-4000-8000-000000000001',
    image_url:
      'https://images.unsplash.com/photo-1528360983277-13d401cdc186?auto=format&fit=crop&w=1600&q=80',
    public_id: 'tafera/seed/destinations/kyoto-3',
    alt_text: 'Red torii gates along a wooded Kyoto path',
    display_order: 2,
    is_cover: false,
    created_at: SEEDED_AT,
    updated_at: SEEDED_AT,
  },
  {
    id: 'd1000000-0000-4000-8000-000000000004',
    destination_id: 'd0000000-0000-4000-8000-000000000002',
    image_url:
      'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?auto=format&fit=crop&w=1600&q=80',
    public_id: 'tafera/seed/destinations/santorini-1',
    alt_text: 'Whitewashed Santorini village above the caldera',
    display_order: 0,
    is_cover: true,
    created_at: SEEDED_AT,
    updated_at: SEEDED_AT,
  },
  {
    id: 'd1000000-0000-4000-8000-000000000005',
    destination_id: 'd0000000-0000-4000-8000-000000000002',
    image_url:
      'https://images.unsplash.com/photo-1613395877344-13d4a8e0d49e?auto=format&fit=crop&w=1600&q=80',
    public_id: 'tafera/seed/destinations/santorini-2',
    alt_text: 'Blue-domed church overlooking the Aegean Sea',
    display_order: 1,
    is_cover: false,
    created_at: SEEDED_AT,
    updated_at: SEEDED_AT,
  },
  {
    id: 'd1000000-0000-4000-8000-000000000006',
    destination_id: 'd0000000-0000-4000-8000-000000000002',
    image_url:
      'https://images.unsplash.com/photo-1533105079780-92b9be482077?auto=format&fit=crop&w=1600&q=80',
    public_id: 'tafera/seed/destinations/santorini-3',
    alt_text: 'Sunset over the Santorini coastline',
    display_order: 2,
    is_cover: false,
    created_at: SEEDED_AT,
    updated_at: SEEDED_AT,
  },
  {
    id: 'd1000000-0000-4000-8000-000000000007',
    destination_id: 'd0000000-0000-4000-8000-000000000003',
    image_url:
      'https://images.unsplash.com/photo-1503614472-8c93d56e92ce?auto=format&fit=crop&w=1600&q=80',
    public_id: 'tafera/seed/destinations/banff-1',
    alt_text: 'Turquoise lake beneath the Canadian Rockies',
    display_order: 0,
    is_cover: true,
    created_at: SEEDED_AT,
    updated_at: SEEDED_AT,
  },
  {
    id: 'd1000000-0000-4000-8000-000000000008',
    destination_id: 'd0000000-0000-4000-8000-000000000003',
    image_url:
      'https://images.unsplash.com/photo-1561134643-668f9057cce4?auto=format&fit=crop&w=1600&q=80',
    public_id: 'tafera/seed/destinations/banff-2',
    alt_text: 'Mountain trail through Banff National Park',
    display_order: 1,
    is_cover: false,
    created_at: SEEDED_AT,
    updated_at: SEEDED_AT,
  },
  {
    id: 'd1000000-0000-4000-8000-000000000009',
    destination_id: 'd0000000-0000-4000-8000-000000000004',
    image_url:
      'https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=1600&q=80',
    public_id: 'tafera/seed/destinations/bali-1',
    alt_text: 'Terraced rice fields in Bali',
    display_order: 0,
    is_cover: true,
    created_at: SEEDED_AT,
    updated_at: SEEDED_AT,
  },
  {
    id: 'd1000000-0000-4000-8000-000000000010',
    destination_id: 'd0000000-0000-4000-8000-000000000004',
    image_url:
      'https://images.unsplash.com/photo-1518548419970-58e3b4079ab2?auto=format&fit=crop&w=1600&q=80',
    public_id: 'tafera/seed/destinations/bali-2',
    alt_text: 'Balinese temple gate at sunrise',
    display_order: 1,
    is_cover: false,
    created_at: SEEDED_AT,
    updated_at: SEEDED_AT,
  },
  {
    id: 'd1000000-0000-4000-8000-000000000011',
    destination_id: 'd0000000-0000-4000-8000-000000000004',
    image_url:
      'https://images.unsplash.com/photo-1555400038-63f5ba517a47?auto=format&fit=crop&w=1600&q=80',
    public_id: 'tafera/seed/destinations/bali-3',
    alt_text: 'Coastal cliffs and ocean in Bali',
    display_order: 2,
    is_cover: false,
    created_at: SEEDED_AT,
    updated_at: SEEDED_AT,
  },
  {
    id: 'd1000000-0000-4000-8000-000000000012',
    destination_id: 'd0000000-0000-4000-8000-000000000005',
    image_url:
      'https://images.unsplash.com/photo-1555881400-74d7acaacd8b?auto=format&fit=crop&w=1600&q=80',
    public_id: 'tafera/seed/destinations/lisbon-1',
    alt_text: 'Lisbon rooftops and the Tagus River',
    display_order: 0,
    is_cover: true,
    created_at: SEEDED_AT,
    updated_at: SEEDED_AT,
  },
  {
    id: 'd1000000-0000-4000-8000-000000000013',
    destination_id: 'd0000000-0000-4000-8000-000000000005',
    image_url:
      'https://images.unsplash.com/photo-1513735492246-483525079686?auto=format&fit=crop&w=1600&q=80',
    public_id: 'tafera/seed/destinations/lisbon-2',
    alt_text: 'Yellow tram climbing a Lisbon street',
    display_order: 1,
    is_cover: false,
    created_at: SEEDED_AT,
    updated_at: SEEDED_AT,
  },
  {
    id: 'd1000000-0000-4000-8000-000000000014',
    destination_id: 'd0000000-0000-4000-8000-000000000006',
    image_url:
      'https://images.unsplash.com/photo-1597212618440-806262de4f6b?auto=format&fit=crop&w=1600&q=80',
    public_id: 'tafera/seed/destinations/marrakech-1',
    alt_text: 'Courtyard and arches in a Marrakech riad',
    display_order: 0,
    is_cover: true,
    created_at: SEEDED_AT,
    updated_at: SEEDED_AT,
  },
  {
    id: 'd1000000-0000-4000-8000-000000000015',
    destination_id: 'd0000000-0000-4000-8000-000000000006',
    image_url:
      'https://images.unsplash.com/photo-1539020140153-e479b8c22e70?auto=format&fit=crop&w=1600&q=80',
    public_id: 'tafera/seed/destinations/marrakech-2',
    alt_text: 'Colourful market lanes in the Marrakech medina',
    display_order: 1,
    is_cover: false,
    created_at: SEEDED_AT,
    updated_at: SEEDED_AT,
  },
  {
    id: 'd1000000-0000-4000-8000-000000000016',
    destination_id: 'd0000000-0000-4000-8000-000000000007',
    image_url:
      'https://images.unsplash.com/photo-1589802829985-817e51171b92?auto=format&fit=crop&w=1600&q=80',
    public_id: 'tafera/seed/destinations/queenstown-1',
    alt_text: 'Lake Wakatipu and the Remarkables near Queenstown',
    display_order: 0,
    is_cover: true,
    created_at: SEEDED_AT,
    updated_at: SEEDED_AT,
  },
  {
    id: 'd1000000-0000-4000-8000-000000000017',
    destination_id: 'd0000000-0000-4000-8000-000000000007',
    image_url:
      'https://images.unsplash.com/photo-1507699622108-4be3abd695ad?auto=format&fit=crop&w=1600&q=80',
    public_id: 'tafera/seed/destinations/queenstown-2',
    alt_text: 'Alpine landscape around Queenstown',
    display_order: 1,
    is_cover: false,
    created_at: SEEDED_AT,
    updated_at: SEEDED_AT,
  },
  {
    id: 'd1000000-0000-4000-8000-000000000018',
    destination_id: 'd0000000-0000-4000-8000-000000000008',
    image_url:
      'https://images.unsplash.com/photo-1580060839134-75a5edca2e99?auto=format&fit=crop&w=1600&q=80',
    public_id: 'tafera/seed/destinations/cape-town-1',
    alt_text: 'Table Mountain above Cape Town',
    display_order: 0,
    is_cover: true,
    created_at: SEEDED_AT,
    updated_at: SEEDED_AT,
  },
  {
    id: 'd1000000-0000-4000-8000-000000000019',
    destination_id: 'd0000000-0000-4000-8000-000000000008',
    image_url:
      'https://images.unsplash.com/photo-1576485375217-d6a95e34d043?auto=format&fit=crop&w=1600&q=80',
    public_id: 'tafera/seed/destinations/cape-town-2',
    alt_text: 'Atlantic coastline along the Cape Peninsula',
    display_order: 1,
    is_cover: false,
    created_at: SEEDED_AT,
    updated_at: SEEDED_AT,
  },
  {
    id: 'd1000000-0000-4000-8000-000000000020',
    destination_id: 'd0000000-0000-4000-8000-000000000009',
    image_url:
      'https://images.unsplash.com/photo-1504893524553-b855bce32c67?auto=format&fit=crop&w=1600&q=80',
    public_id: 'tafera/seed/destinations/reykjavik-1',
    alt_text: 'Icelandic landscape near Reykjavik',
    display_order: 0,
    is_cover: true,
    created_at: SEEDED_AT,
    updated_at: SEEDED_AT,
  },
  {
    id: 'd1000000-0000-4000-8000-000000000021',
    destination_id: 'd0000000-0000-4000-8000-000000000010',
    image_url:
      'https://images.unsplash.com/photo-1526392060635-9d6019884377?auto=format&fit=crop&w=1600&q=80',
    public_id: 'tafera/seed/destinations/cusco-1',
    alt_text: 'Colonial and Inca architecture in Cusco',
    display_order: 0,
    is_cover: true,
    created_at: SEEDED_AT,
    updated_at: SEEDED_AT,
  },
]

const DESTINATION_IDS = DESTINATIONS.map(({ id }) => id)

module.exports = {
  async up(queryInterface) {
    // Fixed primary keys and slugs make repeated runs safe. Existing rows are
    // left untouched rather than updated so local edits are not overwritten.
    await queryInterface.bulkInsert('destinations', DESTINATIONS, {
      ignoreDuplicates: true,
    })
    await queryInterface.bulkInsert(
      'destination_images',
      DESTINATION_IMAGES,
      { ignoreDuplicates: true },
    )
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('destination_images', {
      destination_id: { [Sequelize.Op.in]: DESTINATION_IDS },
    })
    await queryInterface.bulkDelete('destinations', {
      id: { [Sequelize.Op.in]: DESTINATION_IDS },
    })
  },
}
