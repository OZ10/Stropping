package com.classes;

public class QuantityItem extends BaseItem {
    private UOM uom;
    private int quantity;
    private String quantityText;
//    private BaseItem category;

    public UOM getUOM(){
        return uom;
    }

    public void setUOM(UOM uom){
        this.uom = uom;
    }

    public int getQuantity(){
        return quantity;
    }

    public void setQuantity(int quantity){
        this.quantity = quantity;
        this.setQuantityText(convertUOM(this.uom));
    }

    public String getQuantityText(){
        return quantityText;
    }

    private void setQuantityText(String quantityText){
        this.quantityText = quantityText;
    }

//    public BaseItem getCategory(){
//        return category;
//    }
//
//    public void setCategory(BaseItem value){
//        category = value;
//    }

   @Override
    public String toString()
    {
        return name;
    }

    private String convertUOM(UOM uom) {

        String quantity = Integer.toString(this.quantity);

        if (uom.getName().equals("number of")) {
            return uom.getShortName() + quantity;
        } else {
            return quantity + uom.getShortName();
        }
        //return uom;
    }
}
