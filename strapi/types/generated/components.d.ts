import type { Schema, Attribute } from '@strapi/strapi';

export interface UtilsSocialLink extends Schema.Component {
  collectionName: 'components_utils_social_links';
  info: {
    displayName: 'Social Link';
  };
  attributes: {
    title: Attribute.String & Attribute.Required;
    icon: Attribute.Media<'images'>;
    link: Attribute.String & Attribute.Required;
  };
}

export interface UtilsNavigationLink extends Schema.Component {
  collectionName: 'components_utils_navigation_links';
  info: {
    displayName: 'Navigation Link';
    icon: 'earth';
    description: '';
  };
  attributes: {
    title: Attribute.String & Attribute.DefaultTo<'Contact Us'>;
    link: Attribute.String & Attribute.DefaultTo<'/contact-us'>;
  };
}

export interface UtilsListWithEditor extends Schema.Component {
  collectionName: 'components_utils_list_with_editors';
  info: {
    displayName: 'List with Editor';
    icon: 'bulletList';
    description: '';
  };
  attributes: {
    title: Attribute.String & Attribute.Required;
    description: Attribute.RichText &
      Attribute.CustomField<
        'plugin::ckeditor5.CKEditor',
        {
          preset: 'toolbar';
        }
      >;
  };
}

export interface UtilsIconList extends Schema.Component {
  collectionName: 'components_utils_icon_lists';
  info: {
    displayName: 'Icon List';
    icon: 'bulletList';
  };
  attributes: {
    title: Attribute.String & Attribute.Required;
    icon: Attribute.Media<'images'> & Attribute.Required;
    link: Attribute.String;
  };
}

export interface UtilsFormField extends Schema.Component {
  collectionName: 'components_utils_form_fields';
  info: {
    displayName: 'Form Field';
    icon: 'code';
  };
  attributes: {
    name: Attribute.String & Attribute.Required;
    label: Attribute.String & Attribute.Required;
    placeholder: Attribute.String & Attribute.Required;
    type: Attribute.Enumeration<
      ['Text', 'Email', 'Phone', 'TextArea', 'CountrySelect']
    > &
      Attribute.Required &
      Attribute.DefaultTo<'Text'>;
    validationRegex: Attribute.String;
  };
}

export interface UtilsCtaBanner extends Schema.Component {
  collectionName: 'components_utils_cta_banners';
  info: {
    displayName: 'CTA Banner';
    description: '';
  };
  attributes: {
    title: Attribute.String &
      Attribute.DefaultTo<'<span>Pre-order</span> this report for special discounts!'>;
    ctaButton: Attribute.Component<'utils.navigation-link'>;
    type: Attribute.Enumeration<['Type-1', 'Type-2', 'Type-3']> &
      Attribute.Required &
      Attribute.DefaultTo<'Type-1'>;
  };
}

export interface SharedSeo extends Schema.Component {
  collectionName: 'components_shared_seos';
  info: {
    displayName: 'seo';
    icon: 'search';
    description: '';
  };
  attributes: {
    metaTitle: Attribute.String &
      Attribute.Required &
      Attribute.SetMinMaxLength<{
        maxLength: 300;
      }>;
    metaDescription: Attribute.String &
      Attribute.Required &
      Attribute.SetMinMaxLength<{
        minLength: 20;
        maxLength: 400;
      }>;
    metaImage: Attribute.Media<'images' | 'files' | 'videos'>;
    metaSocial: Attribute.Component<'shared.meta-social', true>;
    keywords: Attribute.Text;
    metaRobots: Attribute.String;
    structuredData: Attribute.JSON;
    metaViewport: Attribute.String;
    canonicalURL: Attribute.String;
    extraScripts: Attribute.Text &
      Attribute.SetPluginOptions<{
        translate: {
          translate: 'copy';
        };
      }>;
  };
}

export interface SharedMetaSocial extends Schema.Component {
  collectionName: 'components_shared_meta_socials';
  info: {
    displayName: 'metaSocial';
    icon: 'project-diagram';
    description: '';
  };
  attributes: {
    socialNetwork: Attribute.Enumeration<['Facebook', 'Twitter']> &
      Attribute.Required;
    title: Attribute.String &
      Attribute.Required &
      Attribute.SetMinMaxLength<{
        maxLength: 400;
      }>;
    description: Attribute.String &
      Attribute.Required &
      Attribute.SetMinMaxLength<{
        maxLength: 400;
      }>;
    image: Attribute.Media<'images' | 'files' | 'videos'>;
  };
}

export interface ReportProductVariant extends Schema.Component {
  collectionName: 'components_report_product_variants';
  info: {
    displayName: 'Product Variant';
    description: '';
  };
  attributes: {
    title: Attribute.String &
      Attribute.Required &
      Attribute.SetPluginOptions<{
        translate: {
          translate: 'copy';
        };
      }>;
    description: Attribute.RichText &
      Attribute.Required &
      Attribute.CustomField<
        'plugin::ckeditor5.CKEditor',
        {
          preset: 'toolbar';
        }
      > &
      Attribute.SetPluginOptions<{
        translate: {
          translate: 'copy';
        };
      }>;
    price: Attribute.Component<'report.price-item'>;
  };
}

export interface ReportPriceItem extends Schema.Component {
  collectionName: 'components_report_price_items';
  info: {
    displayName: 'Price Item';
    icon: 'priceTag';
  };
  attributes: {
    currency: Attribute.Enumeration<['USD', 'INR', 'JPY', 'EUR', 'GBP']> &
      Attribute.Required &
      Attribute.DefaultTo<'USD'>;
    amount: Attribute.Decimal & Attribute.Required & Attribute.DefaultTo<3999>;
  };
}

export interface OrderBillingDetails extends Schema.Component {
  collectionName: 'components_order_billing_details';
  info: {
    displayName: 'Billing Details';
    description: 'Customer billing information for orders';
  };
  attributes: {
    firstName: Attribute.String &
      Attribute.Required &
      Attribute.SetMinMaxLength<{
        minLength: 2;
      }>;
    lastName: Attribute.String &
      Attribute.Required &
      Attribute.SetMinMaxLength<{
        minLength: 2;
      }>;
    email: Attribute.Email & Attribute.Required;
    phone: Attribute.String & Attribute.Required;
    country: Attribute.String & Attribute.Required;
    state: Attribute.String;
    city: Attribute.String & Attribute.Required;
    address: Attribute.Text &
      Attribute.Required &
      Attribute.SetMinMaxLength<{
        minLength: 10;
      }>;
    orderNotes: Attribute.Text;
  };
}

export interface HomeStatsCard extends Schema.Component {
  collectionName: 'components_home_stats_cards';
  info: {
    displayName: 'Stats Card';
  };
  attributes: {
    title: Attribute.String & Attribute.Required;
    countFrom: Attribute.Integer & Attribute.Required;
    countTo: Attribute.Integer & Attribute.Required;
    icon: Attribute.Media<'images'> & Attribute.Required;
  };
}

export interface FormEmailStatus extends Schema.Component {
  collectionName: 'components_form_email_statuses';
  info: {
    displayName: 'Email Status';
  };
  attributes: {
    customerAcknowledgmentSent: Attribute.Boolean;
    salesNotificationSent: Attribute.Boolean;
    timestamp: Attribute.DateTime;
  };
}

export interface FooterFooterCta extends Schema.Component {
  collectionName: 'components_footer_footer_ctas';
  info: {
    displayName: 'Footer CTA';
    description: '';
  };
  attributes: {
    title: Attribute.String & Attribute.Required;
    description: Attribute.Text & Attribute.Required;
    ctaButton: Attribute.Component<'utils.navigation-link'> &
      Attribute.Required;
  };
}

export interface FooterCompanyInfo extends Schema.Component {
  collectionName: 'components_footer_company_infos';
  info: {
    displayName: 'Company Info';
    description: '';
  };
  attributes: {
    companyDescription: Attribute.Text & Attribute.Required;
    logo: Attribute.Media<'images'> & Attribute.Required;
  };
}

export interface EmailEmailTime extends Schema.Component {
  collectionName: 'components_email_email_times';
  info: {
    displayName: 'Email Time';
    description: '';
  };
  attributes: {
    email: Attribute.Email & Attribute.Required;
    startTime: Attribute.Time & Attribute.Required;
    endTime: Attribute.Time & Attribute.Required;
  };
}

export interface AboutPageVIsionMissionCard extends Schema.Component {
  collectionName: 'components_about_page_v_ision_mission_cards';
  info: {
    displayName: 'VIsion Mission Card';
    icon: 'grid';
  };
  attributes: {
    title: Attribute.String & Attribute.Required;
    description: Attribute.String & Attribute.Required;
    image: Attribute.Media<'images'> & Attribute.Required;
  };
}

declare module '@strapi/types' {
  export module Shared {
    export interface Components {
      'utils.social-link': UtilsSocialLink;
      'utils.navigation-link': UtilsNavigationLink;
      'utils.list-with-editor': UtilsListWithEditor;
      'utils.icon-list': UtilsIconList;
      'utils.form-field': UtilsFormField;
      'utils.cta-banner': UtilsCtaBanner;
      'shared.seo': SharedSeo;
      'shared.meta-social': SharedMetaSocial;
      'report.product-variant': ReportProductVariant;
      'report.price-item': ReportPriceItem;
      'order.billing-details': OrderBillingDetails;
      'home.stats-card': HomeStatsCard;
      'form.email-status': FormEmailStatus;
      'footer.footer-cta': FooterFooterCta;
      'footer.company-info': FooterCompanyInfo;
      'email.email-time': EmailEmailTime;
      'about-page.v-ision-mission-card': AboutPageVIsionMissionCard;
    }
  }
}
