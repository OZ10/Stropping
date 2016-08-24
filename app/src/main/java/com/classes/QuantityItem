package com.classes;

public class QuantityItem extends BaseItem {
    private String uom;
    private int quantity;
    private String quantityText;
    
    public String getUOM(){
        return uom;
    }

    public void setUOM(String uom){
        this.uom = uom;
    }

    public int getQuantity(){
        return quantity;
    }

    public void setQuantity(int quantity){
        this.quantity = quantity;
        this.setQuantityText(convertUOM(getUOM()));
    }

    public String getQuantityText(){
        return quantityText;
    }

    private void setQuantityText(String quantityText){
        this.quantityText = quantityText;
    }

   @Override
    public String toString()
    {
        return name;
    }

    private String convertUOM(String uom) {

        String quantity = Integer.toString(getQuantity());

        if (uom.equals("number of")) {
            return "x" + quantity;
        }
        else if (uom.equals("grams")) {
            return quantity + "g";
        }
        else if (uom.equals("kilograms")) {
            return quantity + "kg";
        }
        else if (uom.equals("liters")) {
            return quantity + "l";
        }
        else if (uom.equals("milliliters")) {
            return quantity + "ml";
        }
        else if (uom.equals("pints")) {
            return quantity + "pt";
        }
        return uom;
    }
}
