'use strict'

module.exports = (sequelize, DataTypes) => {
  const ScrapbookImage = sequelize.define(
    'ScrapbookImage',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      journalId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      imageUrl: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      publicId: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      altText: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      caption: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      takenAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      displayOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      isCover: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    },
    {
      tableName: 'scrapbook_images',
      underscored: true,
      timestamps: true,
    },
  )

  ScrapbookImage.associate = (models) => {
    ScrapbookImage.belongsTo(models.ScrapbookJournal, {
      foreignKey: 'journalId',
      as: 'journal',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    })
  }

  return ScrapbookImage
}
