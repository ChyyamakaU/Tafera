'use strict'

module.exports = (sequelize, DataTypes) => {
  const EmailVerificationToken = sequelize.define(
    'EmailVerificationToken',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      tokenHash: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
        validate: {
          is: /^[a-f0-9]{64}$/,
        },
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      consumedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null,
      },
    },
    {
      tableName: 'email_verification_tokens',
      underscored: true,
      timestamps: true,
      // The hash is an internal lookup value. Ordinary queries never need it;
      // the verification service queries by hash without selecting the value.
      defaultScope: {
        attributes: {
          exclude: ['tokenHash'],
        },
      },
      scopes: {
        withTokenHash: {
          attributes: {
            include: ['tokenHash'],
          },
        },
      },
    },
  )

  // Defence in depth: even an instance loaded through the token scope cannot
  // leak the hash through JSON serialisation.
  EmailVerificationToken.prototype.toJSON = function toJSON() {
    const { tokenHash, ...safe } = this.get({ plain: true })
    return safe
  }

  EmailVerificationToken.associate = (models) => {
    EmailVerificationToken.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    })
  }

  return EmailVerificationToken
}
